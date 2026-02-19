import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase-config';
import '../styles/AddWorkout.css';

export const AddWorkout = (props) => {
    const {doctor} = props;
    const [newWorkout, setNewWorkout] = useState('');

    const workoutsRef = collection(db, 'Workout');

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
    )
};