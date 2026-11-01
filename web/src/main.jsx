import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n/index.jsx';
import { AuthProvider } from './auth.jsx';
import { applyStoredPreferences } from './components/Controls.jsx';
import { AdminPortal, DoctorPortal, Landing, PatientPortal, StaffPortal } from './portals/Portals.jsx';
import './styles.css';
import './ui.css';

applyStoredPreferences();
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/patient/*" element={<PatientPortal />} />
            <Route path="/staff/*" element={<StaffPortal />} />
            <Route path="/doctor/*" element={<DoctorPortal />} />
            <Route path="/admin/*" element={<AdminPortal />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
