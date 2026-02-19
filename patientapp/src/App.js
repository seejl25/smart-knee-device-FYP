import { Auth } from './components/Auth';
import { Homepage } from './components/Homepage';

// import './App.css';
import { useState, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase-config';

import Cookies from 'universal-cookie';
const cookies = new Cookies();

function App() {
  const [isAuth, setIsAuth] = useState(cookies.get("auth-token"));
  const [doctor, setDoctor] = useState(null);

  const doctorInputRef = useRef();

  const signUserOut = async () => {
    await signOut(auth)
    cookies.remove("auth-token");
    setIsAuth(false);
    setDoctor(null);
  }

  if (!isAuth) {
    return (
      <div className="App">
        <Auth setIsAuth={setIsAuth}/>
      </div>
    );
  }

  return (
    <div>
      {doctor ? (
        <Homepage doctor={doctor} setDoctor={setDoctor}/>
      ) : (
        <div className='doctor'>
          <label>Enter Doctor Name</label>
          <input className='doctor-name' ref={doctorInputRef}/>
          <div className='buttons'>
            <button className='submit-doctor' onClick={() => setDoctor(doctorInputRef.current.value)}>Next</button>
            <button className='sign-out' onClick={signUserOut}>Sign Out</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App;
