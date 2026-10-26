import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { api } from './api';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Home from './pages/Home';
import Folder from './pages/Folder';
import Watch from './pages/Watch';
import Admin from './pages/Admin';
import Share from './pages/Share';

const Auth = createContext(null);
export const useAuth = () => useContext(Auth);

function Layout() {
  return (<><Navbar /><Outlet /></>);
}

export default function App() {
  const [state, setState] = useState(null);
  const refresh = () => api.me().then(setState).catch(() => setState({ authenticated: false, publicBrowsing: false }));
  useEffect(() => { refresh(); }, []);
  if (!state) return <div className="splash">Loading…</div>;

  const canBrowse = state.authenticated || state.publicBrowsing;
  return (
    <Auth.Provider value={{ ...state, refresh }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/s/:token" element={<Share />} />
          <Route element={canBrowse ? <Layout /> : <Navigate to="/login" replace />}>
            <Route index element={<Home />} />
            <Route path="folder/:id" element={<Folder />} />
            <Route path="watch/:id" element={<Watch />} />
            <Route path="admin" element={state.authenticated ? <Admin /> : <Navigate to="/login" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Auth.Provider>
  );
}
