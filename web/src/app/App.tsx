import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { ReviewPage } from '../features/review/ReviewPage';
import { CsvProfilesPage } from '../features/csv-profiles/CsvProfilesPage';
import { TenanciesPage } from '../features/tenancies/TenanciesPage';
import { UploadPage } from '../features/upload/UploadPage';
import { HomePage } from './HomePage';
import { Shell } from './Shell';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="tenancies" element={<TenanciesPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="csv-profiles" element={<CsvProfilesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
