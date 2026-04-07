# Smart Knee Rehabilitation Platform

This project contains two connected web applications for post-operative knee rehabilitation:

- `patientapp`: the patient-facing app used to perform exercises, record knee-angle repetitions, save exercise sessions, and read physiotherapist feedback
- `physiodashboard`: the physiotherapist-facing dashboard used to monitor assigned patients, review exercise progress, inspect session history, and send feedback back to the patient

Together, the two apps simulate a rehabilitation workflow for patients recovering from knee surgery.

## What The Project Does

The platform supports a simple rehab loop:

1. A patient signs into `patientapp`
2. The patient enters the physiotherapist's email
3. The patient starts and stops rehabilitation exercises while knee-angle data is captured
4. The app saves workout and session records to Firebase
5. A physiotherapist signs into `physiodashboard` with the same physiotherapist's email
6. The dashboard shows patients and exercise sessions linked to that `doctorEmail`
7. The physiotherapist reviews progress and sends written feedback
8. The patient sees that feedback back inside `patientapp`

## Apps

### `patientapp`

The patient application is designed for daily rehabilitation use.

Key features:

- Google sign-in
- physiotherapist email assignment
- live knee-angle display using thigh and shank sensor data
- repetition detection and rep peak-angle tracking
- exercise creation and selection
- latest session summary
- saved exercise session history
- collapsible session history grouped by date
- physiotherapist feedback display inside the patient view

Main areas:

- [patientapp/src/App.js](/Users/seejunlong/repos/fypv2/patientapp/src/App.js)
- [patientapp/src/components/Homepage.js](/Users/seejunlong/repos/fypv2/patientapp/src/components/Homepage.js)

### `physiodashboard`

The physiotherapist dashboard is designed for monitoring recovery progress across multiple patients.

Key features:

- Google sign-in for physiotherapists
- patient list filtered by matching `doctorEmail`
- patient selection view
- summary cards for sessions, reps, and angle trends
- average knee-angle trend chart by day
- recent exercise session history
- expandable session cards that reveal rep-by-rep angle details
- feedback form that writes comments for patients to read in `patientapp`

Main areas:

- [physiodashboard/src/App.js](/Users/seejunlong/repos/fypv2/physiodashboard/src/App.js)
- [physiodashboard/src/App.css](/Users/seejunlong/repos/fypv2/physiodashboard/src/App.css)

## Tech Stack

- React
- Firebase Authentication
- Firestore
- Firebase Realtime Database
- Create React App

## Data Flow

- `Workout` stores exercise definitions and assignment metadata such as `doctorEmail`
- `ExerciseSessions` stores saved exercise sessions, rep counts, and rep peak angles
- `PhysioFeedback` stores comments written by physiotherapists for a patient
- Realtime sensor data is read from Firebase Realtime Database under the sensor paths used by `patientapp`

## Running Locally

Open two terminals if you want to run both apps together.

### Patient App

```bash
cd patientapp
npm install
npm start
```

### Physio Dashboard

```bash
cd physiodashboard
npm install
npm start
```

## Important Usage Note

The physiotherapist dashboard only shows records where the saved `doctorEmail` exactly matches the email used to sign into `physiodashboard`.

That means:

- the patient must enter the correct physiotherapist email in `patientapp`
- the physiotherapist must sign in using that same email
- old records without `doctorEmail` will not appear in the current dashboard logic

## Repository Structure

```text
fypv2/
├── patientapp/
│   ├── src/
│   ├── public/
│   └── dataconnect/
├── physiodashboard/
│   ├── src/
│   └── public/
└── README.md
```

## Current Goal

This repository demonstrates how a smart knee rehabilitation system can connect:

- patient exercise tracking
- knee-angle performance monitoring
- physiotherapist oversight
- feedback exchange between clinician and patient

It is suitable as an FYP prototype for showing both the patient workflow and the clinician dashboard experience.
