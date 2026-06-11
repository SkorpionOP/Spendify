import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const response = await api.get('/auth/me');
      if (response.data && response.data.user_id) {
        setUser({
          id: response.data.user_id,
          name: response.data.name || 'User',
          profile_pic: response.data.profile_pic || null,
        });
      } else {
        setUser(null);
      }
    } catch (error) {
      // Don't log out the user if the request failed due to being offline
      if (navigator.onLine) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth not initialized. Falling back to backend session cookie only.");
      checkAuth();
      return;
    }
    
    // Listen for Firebase Auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User logged in via Firebase -> Re-sync backend session cookie
        try {
          await firebaseLogin(
            firebaseUser.uid,
            firebaseUser.email,
            firebaseUser.displayName || firebaseUser.phoneNumber || 'Google User',
            firebaseUser.photoURL
          );
        } catch (err) {
          console.error("Failed to sync Firebase session with backend", err);
          if (navigator.onLine) {
            setUser(null);
          } else {
            // Offline fallback: Use Firebase user data directly
            setUser({
              id: firebaseUser.uid,
              name: firebaseUser.displayName || 'User',
              profile_pic: firebaseUser.photoURL || null,
            });
          }
        } finally {
          setLoading(false);
        }
      } else {
        // No Firebase user -> Check backend session cookie
        await checkAuth();
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data && response.data.status === 'success') {
      setUser({
        id: response.data.user_id,
        name: response.data.name || 'User',
        profile_pic: response.data.profile_pic || null,
      });
      return response.data;
    }
    throw new Error(response.data.message || 'Login failed');
  };

  const signup = async (email, password) => {
    const response = await api.post('/auth/signup', { email, password });
    if (response.data && response.data.status === 'success') {
      setUser({
        id: response.data.user_id,
        name: response.data.name || 'User',
        profile_pic: response.data.profile_pic || null,
      });
      return response.data;
    }
    throw new Error(response.data.message || 'Signup failed');
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
      await signOut(auth);
    } catch (e) {
      // Ignore network errors on logout
    }
    setUser(null);
  };

  const firebaseLogin = async (uid, email, name, profile_pic) => {
    const response = await api.post('/auth/firebase', {
      uid,
      email,
      name,
      profile_pic,
    });
    if (response.data && response.data.status === 'success') {
      setUser({
        id: response.data.user_id,
        name: response.data.name || name || 'User',
        profile_pic: response.data.profile_pic || profile_pic || null,
      });
      return response.data;
    }
    throw new Error(response.data.message || 'Firebase Auth failed');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, firebaseLogin, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
