import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where
} from 'firebase/firestore';
import Cookies from 'universal-cookie';
import { auth, db, provider } from './firebase-config';
import './App.css';

const cookies = new Cookies();
const DEMO_PATIENTS = [
  {
    id: 'demo-patient',
    patientName: 'Amelia Tan',
    patientEmail: 'amelia.tan@demo.local',
    exerciseNames: ['Heel Slides', 'Straight Leg Raise', 'Mini Squat'],
    sessionCount: 7,
    totalReps: 84,
    latestSessionAt: '2026-03-29T09:20:00.000Z'
  }
];
const DEMO_SERIES = [
  { date: 'Mar 23', value: 58 },
  { date: 'Mar 24', value: 61 },
  { date: 'Mar 25', value: 63 },
  { date: 'Mar 26', value: 67 },
  { date: 'Mar 27', value: 69 },
  { date: 'Mar 28', value: 72 },
  { date: 'Mar 29', value: 76 }
];

function formatDate(value, options) {
  if (!value) {
    return 'Not available';
  }

  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString([], options);
}

function toMillis(value) {
  if (!value) {
    return 0;
  }

  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  const timestamp = date.getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function toDayLabel(value) {
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

function buildPatients(workouts, sessions) {
  const patientMap = new Map();

  const touchPatient = (entry, sourceType) => {
    const patientEmail = entry.patientEmail || entry.userEmail || '';
    const patientName = entry.patientName || entry.user || patientEmail || 'Unknown patient';
    const key = patientEmail || patientName;

    if (!key) {
      return;
    }

    const existing = patientMap.get(key) || {
      id: key,
      patientName,
      patientEmail,
      exerciseNames: new Set(),
      sessionCount: 0,
      totalReps: 0,
      latestSessionAt: null
    };

    if (entry.workout) {
      existing.exerciseNames.add(entry.workout);
    }

    if (sourceType === 'session') {
      existing.sessionCount += 1;
      existing.totalReps += Number(entry.repCount) || 0;
      const candidateTime = entry.endedAt || entry.createdAt;
      const candidateTimestamp = toMillis(candidateTime);
      const currentTimestamp = toMillis(existing.latestSessionAt);

      if (candidateTimestamp > currentTimestamp) {
        existing.latestSessionAt = candidateTime;
      }
    }

    patientMap.set(key, existing);
  };

  workouts.forEach((workout) => touchPatient(workout, 'workout'));
  sessions.forEach((session) => touchPatient(session, 'session'));

  return Array.from(patientMap.values())
    .map((patient) => ({
      ...patient,
      exerciseNames: Array.from(patient.exerciseNames)
    }))
    .sort((a, b) => toMillis(b.latestSessionAt) - toMillis(a.latestSessionAt));
}

function buildExerciseOptions(patientSessions) {
  return Array.from(
    new Set(
      patientSessions
        .map((session) => session.workout)
        .filter(Boolean)
    )
  );
}

function buildDailyAverages(patientSessions, selectedExercise) {
  const grouped = new Map();

  patientSessions.forEach((session) => {
    if (selectedExercise !== 'all' && session.workout !== selectedExercise) {
      return;
    }

    const label = toDayLabel(session.endedAt || session.createdAt);
    const repAngles = (session.reps || [])
      .map((rep) => Number(rep.peakAngle))
      .filter((angle) => Number.isFinite(angle));

    if (!repAngles.length) {
      return;
    }

    const existing = grouped.get(label) || [];
    grouped.set(label, [...existing, ...repAngles]);
  });

  return Array.from(grouped.entries()).map(([date, values]) => ({
    date,
    value: Number(average(values).toFixed(1))
  }));
}

function buildSessionFeed(patientSessions) {
  return [...patientSessions].sort(
    (a, b) => toMillis(b.endedAt || b.createdAt) - toMillis(a.endedAt || a.createdAt)
  );
}

function SimpleLineChart({ data }) {
  if (!data.length) {
    return (
      <div className="chart-empty">
        Not enough recorded reps yet to draw an angle trend.
      </div>
    );
  }

  const width = 620;
  const height = 240;
  const padding = 28;
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Average knee angle by day">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis" />
      <polyline fill="none" stroke="#206b54" strokeWidth="4" points={points.join(' ')} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((point, index) => {
        const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
        const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
        return (
          <g key={`${point.date}-${point.value}`}>
            <circle cx={x} cy={y} r="5" fill="#163041" />
            <text x={x} y={height - 8} textAnchor="middle" className="chart-label">{point.date}</text>
            <text x={x} y={y - 12} textAnchor="middle" className="chart-value">{point.value}°</text>
          </g>
        );
      })}
    </svg>
  );
}

function AuthGate({ setSessionReady }) {
  const [error, setError] = useState('');

  const signIn = async () => {
    try {
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      cookies.set('physio-auth-token', result.user.refreshToken);
      setSessionReady(true);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Unable to sign in. Check your Firebase Google sign-in configuration.');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">Physiotherapist Portal</p>
        <h1>Knee rehabilitation dashboard</h1>
        <p className="auth-copy">
          Sign in with the doctor or clinic Google Workspace account. Only patient records saved with your `doctorEmail` will appear here.
        </p>
        <button className="primary-button" onClick={signIn}>Sign in with Google</button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </div>
  );
}

function App() {
  const [sessionReady, setSessionReady] = useState(Boolean(cookies.get('physio-auth-token')));
  const [currentUser, setCurrentUser] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedExercise, setSelectedExercise] = useState('all');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [saveState, setSaveState] = useState('idle');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setSessionReady(Boolean(user));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser?.email) {
      setWorkouts([]);
      setSessions([]);
      return undefined;
    }

    const workoutsQuery = query(
      collection(db, 'Workout'),
      where('doctorEmail', '==', currentUser.email)
    );
    const sessionsQuery = query(
      collection(db, 'ExerciseSessions'),
      where('doctorEmail', '==', currentUser.email)
    );

    const unsubscribeWorkouts = onSnapshot(workoutsQuery, (snapshot) => {
      setWorkouts(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    });
    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    });

    return () => {
      unsubscribeWorkouts();
      unsubscribeSessions();
    };
  }, [currentUser]);

  const realPatients = useMemo(() => buildPatients(workouts, sessions), [workouts, sessions]);
  const usingDemoData = realPatients.length === 0;
  const patients = usingDemoData ? DEMO_PATIENTS : realPatients;
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || patients[0] || null;

  useEffect(() => {
    if (!patients.length) {
      setSelectedPatientId('');
      return;
    }

    if (!selectedPatientId || !patients.some((patient) => patient.id === selectedPatientId)) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patients, selectedPatientId]);

  useEffect(() => {
    setSelectedExercise('all');
  }, [selectedPatientId]);

  const patientSessions = usingDemoData
    ? []
    : sessions.filter((session) => {
        const patientKey = session.patientEmail || session.userEmail || session.user;
        return patientKey === (selectedPatient?.patientEmail || selectedPatient?.patientName);
      });
  const exerciseOptions = usingDemoData
    ? selectedPatient?.exerciseNames || []
    : buildExerciseOptions(patientSessions);
  const chartData = usingDemoData
    ? DEMO_SERIES
    : buildDailyAverages(patientSessions, selectedExercise);
  const sessionFeed = usingDemoData ? [] : buildSessionFeed(patientSessions);
  const summary = usingDemoData
    ? {
        totalSessions: selectedPatient?.sessionCount || 0,
        totalReps: selectedPatient?.totalReps || 0,
        averageAngle: average(DEMO_SERIES.map((item) => item.value)).toFixed(1),
        latestSessionAt: selectedPatient?.latestSessionAt
      }
    : {
        totalSessions: patientSessions.length,
        totalReps: patientSessions.reduce((sum, session) => sum + (Number(session.repCount) || 0), 0),
        averageAngle: chartData.length ? average(chartData.map((item) => item.value)).toFixed(1) : '0.0',
        latestSessionAt: sessionFeed[0]?.endedAt || sessionFeed[0]?.createdAt || null
      };

  const handleSignOut = async () => {
    await signOut(auth);
    cookies.remove('physio-auth-token');
    setCurrentUser(null);
    setSessionReady(false);
    setSelectedPatientId('');
  };

  const saveFeedback = async () => {
    if (!selectedPatient || !feedbackMessage.trim() || usingDemoData || !currentUser?.email) {
      return;
    }

    try {
      setSaveState('saving');
      await addDoc(collection(db, 'PhysioFeedback'), {
        doctorEmail: currentUser.email,
        doctorName: currentUser.displayName || currentUser.email || 'Physiotherapist',
        patientEmail: selectedPatient.patientEmail || '',
        patientName: selectedPatient.patientName || '',
        exerciseName: selectedExercise === 'all' ? '' : selectedExercise,
        message: feedbackMessage.trim(),
        createdAt: serverTimestamp()
      });
      setFeedbackMessage('');
      setSaveState('saved');
    } catch (err) {
      console.error(err);
      setSaveState('error');
    }
  };

  if (!sessionReady || !currentUser) {
    return <AuthGate setSessionReady={setSessionReady} />;
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Assigned Patients</p>
          <h2 className="sidebar-title">Doctor workspace</h2>
          <p className="sidebar-copy">{currentUser.email}</p>
        </div>
        <div className="patient-list">
          {patients.map((patient) => (
            <button
              key={patient.id}
              className={`patient-card ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
              onClick={() => setSelectedPatientId(patient.id)}
              type="button"
            >
              <span className="patient-name">{patient.patientName}</span>
              <span className="patient-email">{patient.patientEmail || 'No patient email yet'}</span>
              <span className="patient-meta-line">
                {patient.sessionCount || 0} sessions · {(patient.exerciseNames || []).length} exercises
              </span>
            </button>
          ))}
        </div>
        <button className="ghost-button" onClick={handleSignOut}>Sign out</button>
      </aside>

      <main className="dashboard-main">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Post-op Knee Rehab</p>
            <h1>{selectedPatient?.patientName || 'No patient selected'}</h1>
            <p className="hero-copy">
              Review session adherence, angle trends, and leave structured exercise feedback for the patient to read in their app.
            </p>
          </div>
          <div className="hero-badges">
            <span className="badge">Monitoring: ACL / knee surgery pathway</span>
            <span className={`badge ${usingDemoData ? 'badge-warn' : ''}`}>
              {usingDemoData ? 'Demo preview data' : 'Live doctorEmail data'}
            </span>
          </div>
        </section>

        <section className="summary-grid">
          <div className="summary-card">
            <span className="metric-label">Total sessions</span>
            <strong>{summary.totalSessions}</strong>
          </div>
          <div className="summary-card">
            <span className="metric-label">Total reps</span>
            <strong>{summary.totalReps}</strong>
          </div>
          <div className="summary-card">
            <span className="metric-label">Average daily peak angle</span>
            <strong>{summary.averageAngle}°</strong>
          </div>
          <div className="summary-card">
            <span className="metric-label">Latest recorded session</span>
            <strong>{formatDate(summary.latestSessionAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
          </div>
        </section>

        <section className="content-grid">
          <div className="panel panel-large">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Movement Trend</p>
                <h2>Average knee angle by day</h2>
              </div>
              <select value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}>
                <option value="all">All exercises</option>
                {exerciseOptions.map((exerciseName) => (
                  <option key={exerciseName} value={exerciseName}>{exerciseName}</option>
                ))}
              </select>
            </div>
            <SimpleLineChart data={chartData} />
          </div>

          <div className="panel">
            <p className="eyebrow">Exercise Summary</p>
            <h2>Plan overview</h2>
            <div className="exercise-tags">
              {(selectedPatient?.exerciseNames || []).map((exerciseName) => (
                <span className="tag" key={exerciseName}>{exerciseName}</span>
              ))}
            </div>
            <p className="supporting-copy">
              Focus on achieving steady flexion gains while keeping daily exercise consistency high.
            </p>
          </div>

          <div className="panel">
            <p className="eyebrow">Session History</p>
            <h2>Recent exercise sessions</h2>
            {usingDemoData ? (
              <p className="supporting-copy">No `doctorEmail` records were found for this signed-in physiotherapist yet.</p>
            ) : sessionFeed.length === 0 ? (
              <p className="supporting-copy">No saved sessions for this patient yet.</p>
            ) : (
              <div className="session-feed">
                {sessionFeed.slice(0, 6).map((session) => (
                  <div className="session-row" key={session.id}>
                    <div>
                      <strong>{session.workout}</strong>
                      <p>{formatDate(session.endedAt || session.createdAt)}</p>
                    </div>
                    <span>{session.repCount} reps</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel panel-large">
            <p className="eyebrow">Patient Feedback</p>
            <h2>Write guidance for the patient</h2>
            <textarea
              className="feedback-box"
              placeholder="Example: Good flexion progress this week. Keep heel slides slow and controlled, and stop if swelling increases."
              value={feedbackMessage}
              onChange={(event) => setFeedbackMessage(event.target.value)}
              disabled={usingDemoData}
            />
            <div className="feedback-actions">
              <p className="supporting-copy">
                {usingDemoData
                  ? 'Feedback is disabled until a patient record exists with this exact doctorEmail.'
                  : 'Saved feedback appears in the patient app under Physiotherapist Feedback.'}
              </p>
              <button className="primary-button" onClick={saveFeedback} disabled={saveState === 'saving' || usingDemoData}>
                {saveState === 'saving' ? 'Saving...' : 'Send feedback'}
              </button>
            </div>
            {saveState === 'saved' ? <p className="success-text">Feedback saved successfully.</p> : null}
            {saveState === 'error' ? <p className="error-text">Feedback could not be saved.</p> : null}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
