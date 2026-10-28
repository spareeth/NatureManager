import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { ScanPage } from './ScanPage';

const assetByCode = vi.fn();
vi.mock('../labels/api', () => ({ assetByCode: (...a: unknown[]) => assetByCode(...a) }));

function renderScan(code: string, org: Partial<OrgState> = {}) {
  const switchOrg = vi.fn();
  const value: OrgState = {
    memberships: [],
    loading: false,
    error: null,
    switchOrg,
    current: {
      organisationId: 'terra',
      organisationName: 'Terra',
      organisationSlug: 'terra',
      roles: ['owner'],
      displayName: 'O',
    },
    ...org,
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={value}>
        <MemoryRouter initialEntries={[`/a/${code}`]}>
          <Routes>
            <Route path="/a/:code" element={<ScanPage />} />
            <Route path="/assets/:id" element={<h1>asset page</h1>} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
  return { switchOrg };
}

describe('QR scan route', () => {
  it('opens the asset for a known tag', async () => {
    assetByCode.mockResolvedValueOnce({
      id: 'a1',
      organisation_id: 'terra',
      tag_code: 'WG07-T04_PRO',
      matched: 'tag',
    });
    const { switchOrg } = renderScan('WG07-T04_PRO');
    expect(await screen.findByRole('heading', { name: 'asset page' })).toBeInTheDocument();
    expect(assetByCode).toHaveBeenCalledWith('WG07-T04_PRO', 'terra');
    expect(switchOrg).not.toHaveBeenCalled();
  });

  it("switches organisation when the asset belongs to another of the user's organisations", async () => {
    assetByCode.mockResolvedValueOnce({
      id: 'b1',
      organisation_id: 'demo',
      tag_code: 'X',
      matched: 'barcode',
    });
    const { switchOrg } = renderScan('4006381333931');
    await waitFor(() => expect(switchOrg).toHaveBeenCalledWith('demo'));
  });

  it('explains when nothing matches', async () => {
    assetByCode.mockResolvedValueOnce(null);
    renderScan('NOPE-1');
    expect(await screen.findByRole('heading', { name: 'Asset not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search the asset list' })).toHaveAttribute(
      'href',
      '/assets?q=NOPE-1',
    );
  });
});
