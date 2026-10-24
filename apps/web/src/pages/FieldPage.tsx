import { Route, Routes } from 'react-router-dom';
import { JobScreen } from '../field/JobScreen';
import { MyDay } from '../field/MyDay';
import { ScanScreen } from '../field/ScanScreen';
import { SyncBar } from '../field/SyncBar';
import { useCurrentSite } from '../org/useSite';

/** Field app (FR-FLD): My day and the job screen. Large touch targets throughout (FR-FLD-06). */
export function FieldPage() {
  const { site } = useCurrentSite();
  return (
    <div className="h-full overflow-y-auto">
      <SyncBar siteId={site?.id} />
      <Routes>
        <Route index element={<MyDay />} />
        <Route path="jobs/:id" element={<JobScreen />} />
        <Route path="scan" element={<ScanScreen />} />
      </Routes>
    </div>
  );
}
