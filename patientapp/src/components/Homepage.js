import React, { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, serverTimestamp, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase-config';
import '../styles/Homepage.css';

export const Homepage = (props) => {
    const {doctor, setDoctor} = props;
    const [newWorkout, setNewWorkout] = useState('');
    const [workoutList, setWorkoutList] = useState([]);
    
    const workoutsRef = collection(db, 'Workout');

    useEffect(() => {
        const queryWorkouts = query(workoutsRef, where('user', '==', auth.currentUser.displayName));
        const unsubscribe = onSnapshot(queryWorkouts, (snapshot) => {
            let workouts = [];
            snapshot.forEach((doc) => {
                workouts.push({...doc.data(), id: doc.id})
            });
            workouts.sort((a, b) => b.createdAt - a.createdAt);  // Sort in JavaScript
            setWorkoutList(workouts);
        });

        return () => unsubscribe();
    }, [workoutsRef]);
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (newWorkout === "") return;

        await addDoc(workoutsRef, {
            workout: newWorkout,
            createdAt: serverTimestamp(),
            user: auth.currentUser.displayName,
            doctor: doctor,
        });
    
        setNewWorkout('');
    }

    return (
        <div className="homepage">
            <div className='header'>
                <div className='heading'>
                    <h1>{auth.currentUser.displayName}</h1>
                    <button className='back-button' onClick={() => setDoctor(null)}>Back</button>
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
            <div className='workout-list'>
                {workoutList.map((workout) => (
                    <div key={workout.id} className="workouts">
                        <span className='workout-type'>{workout.workout}</span>
                        <span className='date'>{workout.createdAt?.toDate().toDateString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}