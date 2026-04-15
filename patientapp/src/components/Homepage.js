import React, { useEffect, useRef, useState } from 'react';
import {
    addDoc,
    collection,
    onSnapshot,
    query as firestoreQuery,
    serverTimestamp,
    where
} from 'firebase/firestore';
import {
    onValue,
    ref
} from 'firebase/database';
import { db, rtdb } from '../firebase-config';
import '../styles/Homepage.css';

const SENSOR_SAMPLE_LIMIT = 60;
const START_ANGLE_MIN = 20;
const START_ANGLE_MAX = 70;
const MAX_SENSOR_MATCH_GAP_MS = 1000;

function parseTimestamp(entry) {
    if (!entry || typeof entry !== 'object') {
        return 0;
    }

    if (typeof entry.timestampMs === 'number' && Number.isFinite(entry.timestampMs)) {
        return entry.timestampMs;
    }

    if (typeof entry.timestamp !== 'string' || entry.timestamp.trim() === '') {
        return 0;
    }

    const normalized = entry.timestamp.includes('T')
        ? entry.timestamp
        : entry.timestamp.replace(' ', 'T');
    const parsed = Date.parse(normalized);

    return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeSensorData(data) {
    if (!data) {
        return [];
    }

    return Object.entries(data)
        .map(([id, value]) => {
            if (!value || typeof value !== 'object') {
                return null;
            }

            const timestampMs = parseTimestamp(value);

            return {
                id,
                angle: Number(value.angle) || 0,
                timestamp: value.timestamp || '',
                timestampMs
            };
        })
        .filter(Boolean)
        .filter((entry) => entry.timestampMs > 0)
        .sort((a, b) => a.timestampMs - b.timestampMs);
}

function toPatientKey(email) {
    if (typeof email !== 'string' || email.trim() === '') {
        return 'default-patient';
    }

    return email.trim().toLowerCase().replace(/[@.#$/[\]]/g, '_');
}

function appendLatestSample(currentSamples, latestEntry) {
    if (!latestEntry || latestEntry.timestampMs <= 0) {
        return currentSamples;
    }

    const lastSample = currentSamples[currentSamples.length - 1];

    if (lastSample?.timestampMs === latestEntry.timestampMs) {
        return currentSamples;
    }

    const nextSamples = [...currentSamples, latestEntry];
    return nextSamples.slice(-SENSOR_SAMPLE_LIMIT);
}

function normalizeExerciseName(value) {
    return (value || '').trim().toLowerCase();
}

function getExerciseMode(exerciseName) {
    const normalizedName = normalizeExerciseName(exerciseName);

    if (normalizedName === 'leg extension') {
        return 'extension';
    }

    if (normalizedName === 'leg flexion') {
        return 'flexion';
    }

    return null;
}

function isWithinStartRange(angle) {
    return angle >= START_ANGLE_MIN && angle <= START_ANGLE_MAX;
}

function getRepFeedback(mode, achievedAngle) {
    if (mode === 'extension') {
        if (achievedAngle >= 0 && achievedAngle <= 10) {
            return 'success';
        }

        if (achievedAngle > 10 && achievedAngle < START_ANGLE_MIN) {
            return 'warning';
        }
    }

    if (mode === 'flexion') {
        if (achievedAngle > 90) {
            return 'success';
        }

        if (achievedAngle > START_ANGLE_MAX && achievedAngle <= 90) {
            return 'warning';
        }
    }

    return 'idle';
}

function findClosestMatch(thighEntry, shankData) {
    let closest = null;
    let minDiff = Number.POSITIVE_INFINITY;

    for (const shankEntry of shankData) {
        const diff = Math.abs(thighEntry.timestampMs - shankEntry.timestampMs);

        if (diff < minDiff) {
            minDiff = diff;
            closest = shankEntry;
        }
    }

    if (minDiff > MAX_SENSOR_MATCH_GAP_MS) {
        return null;
    }

    return closest;
}

function formatDateTime(value) {
    if (!value) {
        return 'Not available';
    }

    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return date.toLocaleString();
}

function toDateObject(value) {
    if (!value) {
        return null;
    }

    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatSessionDate(value) {
    const date = toDateObject(value);

    if (!date) {
        return 'Unknown date';
    }

    return date.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatSessionTime(value) {
    const date = toDateObject(value);

    if (!date) {
        return 'Unknown time';
    }

    return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
    });
}

function groupSessionsByDate(sessionList) {
    const groupedSessions = new Map();

    sessionList.forEach((session) => {
        const sessionDate = session.endedAt || session.createdAt;
        const groupKey = formatSessionDate(sessionDate);
        const existingSessions = groupedSessions.get(groupKey) || [];

        groupedSessions.set(groupKey, [...existingSessions, session]);
    });

    return Array.from(groupedSessions.entries()).map(([dateLabel, sessions]) => ({
        dateLabel,
        sessions
    }));
}

export const Homepage = (props) => {
    const { currentUser, doctorEmail, setDoctorEmail } = props;
    const [newWorkout, setNewWorkout] = useState('');
    const [selectedWorkout, setSelectedWorkout] = useState('');
    const [workoutList, setWorkoutList] = useState([]);
    const [sessionList, setSessionList] = useState([]);
    const [feedbackList, setFeedbackList] = useState([]);
    const [thighData, setThighData] = useState([]);
    const [shankData, setShankData] = useState([]);
    const [kneeAngle, setKneeAngle] = useState(null);
    const [latestSample, setLatestSample] = useState(null);
    const [isExerciseActive, setIsExerciseActive] = useState(false);
    const [currentRepNumber, setCurrentRepNumber] = useState(1);
    const [currentRepAngle, setCurrentRepAngle] = useState(null);
    const [repCount, setRepCount] = useState(0);
    const [repSummaries, setRepSummaries] = useState([]);
    const [latestSessionSummary, setLatestSessionSummary] = useState(null);
    const [sessionStartedAt, setSessionStartedAt] = useState(null);
    const [isSavingSession, setIsSavingSession] = useState(false);
    const [liveAngleFeedback, setLiveAngleFeedback] = useState('idle');
    const patientEmail = currentUser?.email || '';
    const patientName = currentUser?.displayName || '';

    const workoutsRef = collection(db, 'Workout');
    const exerciseSessionsRef = collection(db, 'ExerciseSessions');
    const physioFeedbackRef = collection(db, 'PhysioFeedback');
    const repTrackerRef = useRef({
        inProgress: false,
        targetAngle: null,
        movedOutOfStartRange: false,
        completedReps: [],
        lastProcessedTimestamp: null
    });
    const groupedSessionList = groupSessionsByDate(sessionList);

    useEffect(() => {
        const workoutsQuery = firestoreQuery(
            workoutsRef,
            where('user', '==', patientName)
        );

        const unsubscribe = onSnapshot(workoutsQuery, (snapshot) => {
            const workouts = snapshot.docs
                .map((doc) => ({ ...doc.data(), id: doc.id }))
                .sort((a, b) => {
                    const aTime = a.createdAt?.seconds || 0;
                    const bTime = b.createdAt?.seconds || 0;
                    return bTime - aTime;
                });

            setWorkoutList(workouts);
        });

        return () => unsubscribe();
    }, [patientName, workoutsRef]);

    useEffect(() => {
        if (!selectedWorkout && workoutList.length > 0) {
            setSelectedWorkout(workoutList[0].workout);
        }
    }, [selectedWorkout, workoutList]);

    useEffect(() => {
        const sessionQuery = firestoreQuery(
            exerciseSessionsRef,
            where('user', '==', patientName)
        );

        const unsubscribe = onSnapshot(sessionQuery, (snapshot) => {
            const sessions = snapshot.docs
                .map((doc) => ({ ...doc.data(), id: doc.id }))
                .sort((a, b) => {
                    const aTime = a.createdAt?.seconds || 0;
                    const bTime = b.createdAt?.seconds || 0;
                    return bTime - aTime;
                });

            setSessionList(sessions);
        });

        return () => unsubscribe();
    }, [exerciseSessionsRef, patientName]);

    useEffect(() => {
        if (!patientEmail) {
            return undefined;
        }

        const feedbackQuery = firestoreQuery(
            physioFeedbackRef,
            where('patientEmail', '==', patientEmail)
        );

        const unsubscribe = onSnapshot(feedbackQuery, (snapshot) => {
            const feedbackEntries = snapshot.docs
                .map((doc) => ({ ...doc.data(), id: doc.id }))
                .sort((a, b) => {
                    const aTime = a.createdAt?.seconds || 0;
                    const bTime = b.createdAt?.seconds || 0;
                    return bTime - aTime;
                });

            setFeedbackList(feedbackEntries);
        });

        return () => unsubscribe();
    }, [patientEmail, physioFeedbackRef]);

    useEffect(() => {
        if (!patientEmail) {
            return undefined;
        }

        const patientKey = toPatientKey(patientEmail);
        const thighLatestRef = ref(rtdb, `liveSensors/${patientKey}/thigh/latest`);
        const shankLatestRef = ref(rtdb, `liveSensors/${patientKey}/shank/latest`);

        const unsubscribeThigh = onValue(thighLatestRef, (snapshot) => {
            const latestEntries = normalizeSensorData({ latest: snapshot.val() });

            if (latestEntries.length === 0) {
                return;
            }

            setThighData((currentSamples) => appendLatestSample(currentSamples, latestEntries[0]));
        });

        const unsubscribeShank = onValue(shankLatestRef, (snapshot) => {
            const latestEntries = normalizeSensorData({ latest: snapshot.val() });

            if (latestEntries.length === 0) {
                return;
            }

            setShankData((currentSamples) => appendLatestSample(currentSamples, latestEntries[0]));
        });

        return () => {
            unsubscribeThigh();
            unsubscribeShank();
        };
    }, [patientEmail]);

    useEffect(() => {
        if (thighData.length === 0 || shankData.length === 0) {
            return;
        }

        const latestThigh = thighData[thighData.length - 1];
        const match = findClosestMatch(latestThigh, shankData);

        if (!match) {
            return;
        }

        const angle = Math.abs(latestThigh.angle - match.angle);
        const timestampMs = Math.max(latestThigh.timestampMs, match.timestampMs);

        setKneeAngle(angle);
        setLatestSample({
            angle,
            timestampMs,
            timestamp: latestThigh.timestamp || match.timestamp
        });
    }, [shankData, thighData]);

    useEffect(() => {
        if (!isExerciseActive || !latestSample) {
            return;
        }

        if (repTrackerRef.current.lastProcessedTimestamp === latestSample.timestampMs) {
            return;
        }

        repTrackerRef.current.lastProcessedTimestamp = latestSample.timestampMs;

        const liveAngle = latestSample.angle;
        const exerciseMode = getExerciseMode(selectedWorkout);

        if (!exerciseMode) {
            setCurrentRepNumber(repTrackerRef.current.completedReps.length + 1);
            setCurrentRepAngle(null);
            setLiveAngleFeedback('idle');
            return;
        }

        if (!repTrackerRef.current.inProgress && isWithinStartRange(liveAngle)) {
            repTrackerRef.current.inProgress = true;
            repTrackerRef.current.targetAngle = liveAngle;
            repTrackerRef.current.movedOutOfStartRange = false;
            setCurrentRepNumber(repTrackerRef.current.completedReps.length + 1);
            setCurrentRepAngle(liveAngle);
            setLiveAngleFeedback('idle');
            return;
        }

        if (!repTrackerRef.current.inProgress) {
            setCurrentRepNumber(repTrackerRef.current.completedReps.length + 1);
            setCurrentRepAngle(null);
            return;
        }

        if (exerciseMode === 'extension') {
            repTrackerRef.current.targetAngle = repTrackerRef.current.targetAngle === null
                ? liveAngle
                : Math.min(repTrackerRef.current.targetAngle, liveAngle);

            if (liveAngle < START_ANGLE_MIN) {
                repTrackerRef.current.movedOutOfStartRange = true;
            }
        }

        if (exerciseMode === 'flexion') {
            repTrackerRef.current.targetAngle = repTrackerRef.current.targetAngle === null
                ? liveAngle
                : Math.max(repTrackerRef.current.targetAngle, liveAngle);

            if (liveAngle > START_ANGLE_MAX) {
                repTrackerRef.current.movedOutOfStartRange = true;
            }
        }

        setCurrentRepNumber(repTrackerRef.current.completedReps.length + 1);
        setCurrentRepAngle(repTrackerRef.current.targetAngle);

        if (repTrackerRef.current.movedOutOfStartRange && isWithinStartRange(liveAngle)) {
            const achievedAngle = Number((repTrackerRef.current.targetAngle ?? liveAngle).toFixed(2));
            const feedback = getRepFeedback(exerciseMode, achievedAngle);
            const completedRep = {
                repNumber: repTrackerRef.current.completedReps.length + 1,
                peakAngle: achievedAngle,
                feedback,
                completedAt: new Date(latestSample.timestampMs).toISOString()
            };

            repTrackerRef.current.completedReps = [
                ...repTrackerRef.current.completedReps,
                completedRep
            ];
            repTrackerRef.current.inProgress = false;
            repTrackerRef.current.targetAngle = null;
            repTrackerRef.current.movedOutOfStartRange = false;

            setRepSummaries(repTrackerRef.current.completedReps);
            setRepCount(repTrackerRef.current.completedReps.length);
            setCurrentRepNumber(repTrackerRef.current.completedReps.length + 1);
            setCurrentRepAngle(null);
            setLiveAngleFeedback(feedback);
        }
    }, [isExerciseActive, latestSample, selectedWorkout]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const workoutName = newWorkout.trim();

        if (workoutName === '') {
            return;
        }

        await addDoc(workoutsRef, {
            workout: workoutName,
            createdAt: serverTimestamp(),
            user: patientName,
            userEmail: patientEmail,
            patientEmail,
            patientName,
            doctor: doctorEmail,
            doctorEmail
        });

        setSelectedWorkout(workoutName);
        setNewWorkout('');
    };

    const handleStartExercise = () => {
        const workoutName = selectedWorkout || newWorkout.trim();

        if (!workoutName) {
            return;
        }

        repTrackerRef.current = {
            inProgress: false,
            targetAngle: null,
            movedOutOfStartRange: false,
            completedReps: [],
            lastProcessedTimestamp: null
        };

        setSelectedWorkout(workoutName);
        setIsExerciseActive(true);
        setRepCount(0);
        setRepSummaries([]);
        setCurrentRepNumber(1);
        setCurrentRepAngle(null);
        setLatestSessionSummary(null);
        setSessionStartedAt(new Date().toISOString());
        setLiveAngleFeedback('idle');
    };

    const handleStopExercise = async () => {
        if (!isExerciseActive) {
            return;
        }

        setIsExerciseActive(false);
        setLiveAngleFeedback('idle');

        const sessionSummary = {
            workout: selectedWorkout,
            user: patientName,
            userEmail: patientEmail,
            patientEmail,
            patientName,
            doctor: doctorEmail,
            doctorEmail,
            repCount: repTrackerRef.current.completedReps.length,
            reps: repTrackerRef.current.completedReps,
            startedAt: sessionStartedAt,
            endedAt: new Date().toISOString()
        };

        setLatestSessionSummary(sessionSummary);
        setCurrentRepAngle(null);
        setCurrentRepNumber(repTrackerRef.current.completedReps.length + 1);

        try {
            setIsSavingSession(true);
            await addDoc(exerciseSessionsRef, {
                ...sessionSummary,
                createdAt: serverTimestamp()
            });
        } finally {
            setIsSavingSession(false);
        }
    };

    return (
        <div className="homepage">
            <div className="header">
                <div className="heading">
                    <h1>{patientName}</h1>
                    <button className="back-button" onClick={() => setDoctorEmail(null)}>Back</button>
                </div>
                <div className="patient-meta">
                    <div className="meta-pill">
                        <span className="panel-label">Signed in as</span>
                        <span>{patientEmail}</span>
                    </div>
                    <div className="meta-pill">
                        <span className="panel-label">Assigned physio</span>
                        <span>{doctorEmail}</span>
                    </div>
                </div>
                <div className="add-workout">
                    <form onSubmit={handleSubmit} className="new-workout-form">
                        <input
                            className="type-workout"
                            placeholder="Input your workout type"
                            onChange={(e) => setNewWorkout(e.target.value)}
                            value={newWorkout}
                        />
                        <button type="submit" className="submit-workout">Add Workout</button>
                    </form>
                </div>
            </div>

            <div className="exercise-panel">
                <div className="exercise-panel__summary">
                    <span className="panel-label">Selected Exercise</span>
                    <span className="panel-value">{selectedWorkout || 'Choose or add an exercise'}</span>
                </div>
                <div className="exercise-panel__summary">
                    <span className="panel-label">Exercise Status</span>
                    <span className={`session-status ${isExerciseActive ? 'active' : 'inactive'}`}>
                        {isExerciseActive ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <div className="exercise-actions">
                    <button
                        className="exercise-button start-button"
                        onClick={handleStartExercise}
                        disabled={isExerciseActive || (!selectedWorkout && !newWorkout.trim())}
                    >
                        Start Exercise
                    </button>
                    <button
                        className="exercise-button stop-button"
                        onClick={handleStopExercise}
                        disabled={!isExerciseActive || isSavingSession}
                    >
                        {isSavingSession ? 'Saving...' : 'Stop Exercise'}
                    </button>
                </div>
            </div>

            <div className="stats-grid">
                <div className={`stat-card live-angle-card live-angle-card--${liveAngleFeedback}`}>
                    <span className="panel-label">Live Knee Angle</span>
                    <span className="stat-value">
                        {kneeAngle !== null ? `${kneeAngle.toFixed(2)}°` : 'Waiting for sensor data'}
                    </span>
                </div>
                <div className="stat-card">
                    <span className="panel-label">Completed Reps</span>
                    <span className="stat-value">{repCount}</span>
                </div>
                <div className="stat-card">
                    <span className="panel-label">Current Rep</span>
                    <span className="stat-value">{isExerciseActive ? currentRepNumber : '-'}</span>
                </div>
                <div className="stat-card">
                    <span className="panel-label">Current Rep Best Angle</span>
                    <span className="stat-value">
                        {isExerciseActive && currentRepAngle !== null
                            ? `${currentRepAngle.toFixed(2)}°`
                            : 'No rep in progress'}
                    </span>
                </div>
            </div>

            <div className="content-grid">
                <div className="content-card">
                    <h2>Workout List</h2>
                    <div className="workout-list">
                        {workoutList.map((workout) => (
                            <button
                                key={workout.id}
                                className={`workouts ${selectedWorkout === workout.workout ? 'selected' : ''}`}
                                onClick={() => setSelectedWorkout(workout.workout)}
                                type="button"
                            >
                                <span className="workout-type">{workout.workout}</span>
                                <span className="date">{workout.createdAt?.toDate().toDateString()}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="content-card">
                    <h2>Current Session Rep Summary</h2>
                    {repSummaries.length === 0 ? (
                        <p className="empty-state">No completed reps yet.</p>
                    ) : (
                        <div className="rep-list">
                            {repSummaries.map((rep) => (
                                <div
                                    key={rep.repNumber}
                                    className={`rep-row rep-row--${rep.feedback || 'idle'}`}
                                >
                                    <span>Rep {rep.repNumber}</span>
                                    <span>{rep.peakAngle.toFixed(2)}°</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="content-card session-history">
                <h2>Latest Session Summary</h2>
                {latestSessionSummary ? (
                    <div className="session-summary">
                        <p>
                            <strong>Exercise:</strong> {latestSessionSummary.workout}
                        </p>
                        <p>
                            <strong>Started:</strong> {formatDateTime(latestSessionSummary.startedAt)}
                        </p>
                        <p>
                            <strong>Ended:</strong> {formatDateTime(latestSessionSummary.endedAt)}
                        </p>
                        <p>
                            <strong>Total Reps:</strong> {latestSessionSummary.repCount}
                        </p>
                        <div className="rep-list">
                            {latestSessionSummary.reps.length === 0 ? (
                                <p className="empty-state">No completed reps were recorded for this session.</p>
                            ) : (
                                latestSessionSummary.reps.map((rep) => (
                                    <div
                                        key={`latest-${rep.repNumber}`}
                                        className={`rep-row rep-row--${rep.feedback || 'idle'}`}
                                    >
                                        <span>Rep {rep.repNumber}</span>
                                        <span>{rep.peakAngle.toFixed(2)}°</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="empty-state">Stop an exercise to save and display its summary.</p>
                )}
            </div>

            <div className="content-card session-history">
                <h2>Physiotherapist Feedback</h2>
                {feedbackList.length === 0 ? (
                    <p className="empty-state">No physio comments yet. Feedback written in the physiotherapist dashboard will appear here.</p>
                ) : (
                    <div className="feedback-list">
                        {feedbackList.map((feedback) => (
                            <div key={feedback.id} className="feedback-card">
                                <div className="session-card__header">
                                    <span className="workout-type feedback-author">{feedback.doctorName || feedback.doctorEmail || 'Physiotherapist'}</span>
                                    <span className="date">{formatDateTime(feedback.createdAt)}</span>
                                </div>
                                {feedback.exerciseName ? (
                                    <p className="feedback-focus">
                                        Exercise focus: {feedback.exerciseName}
                                    </p>
                                ) : null}
                                <p className="feedback-message">{feedback.message}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="content-card session-history">
                <h2>Saved Exercise Sessions</h2>
                {sessionList.length === 0 ? (
                    <p className="empty-state">No saved sessions yet.</p>
                ) : (
                    <div className="session-date-groups">
                        {groupedSessionList.map((group) => (
                            <details key={group.dateLabel} className="session-date-group" open>
                                <summary className="session-date-summary">
                                    <span>{group.dateLabel}</span>
                                    <span>{group.sessions.length} sessions</span>
                                </summary>
                                <div className="session-list">
                                    {group.sessions.map((session) => (
                                        <details key={session.id} className="session-card">
                                            <summary className="session-card__summary">
                                                <div>
                                                    <span className="workout-type">{session.workout}</span>
                                                    <span className="date">{formatSessionTime(session.endedAt || session.createdAt)}</span>
                                                </div>
                                                <span>{session.repCount} reps</span>
                                            </summary>
                                            <div className="session-card__body">
                                                <div className="session-card__header">
                                                    <span className="workout-type">{session.workout}</span>
                                                    <span className="date">{formatDateTime(session.createdAt)}</span>
                                                </div>
                                                <p>Total reps: {session.repCount}</p>
                                                <div className="rep-list">
                                                    {(session.reps || []).map((rep) => (
                                                        <div
                                                            key={`${session.id}-${rep.repNumber}`}
                                                            className={`rep-row rep-row--${rep.feedback || 'idle'}`}
                                                        >
                                                            <span>Rep {rep.repNumber}</span>
                                                            <span>{Number(rep.peakAngle).toFixed(2)}°</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </details>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
