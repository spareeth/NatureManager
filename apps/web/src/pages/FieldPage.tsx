import { Route, Routes } from 'react-router-dom';
import { JobScreen } from '../field/JobScreen';
import { MyDay } from '../field/MyDay';

/** Field app (FR-FLD): My day and the job screen. Large touch targets throughout (FR-FLD-06). */
export function FieldPage() {
  return (
    <div className="h-full overflow-y-auto">
      <Routes>
        <Route index element={<MyDay />} />
        <Route path="jobs/:id" element={<JobScreen />} />
      </Routes>
    </div>
  );
}
