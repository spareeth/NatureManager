import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { BedMap, type IndicatorLayer } from './BedMap';

vi.mock('../components/LeafletMap', () => ({ LeafletMap: () => <div data-testid="map" /> }));
vi.mock('../map/api', () => ({
  fetchLocations: async () => ({ type: 'FeatureCollection', features: [] }),
}));
vi.mock('../map/basemaps', () => ({
  fetchBasemaps: async () => [],
  resolveBasemaps: () => ({ layers: [], defaultId: '' }),
  tileLayerFor: vi.fn(),
  KEYS: {},
}));

const layer = (key: string): IndicatorLayer => ({
  key,
  group: 'Diversity',
  label: key.toUpperCase(),
  help: `${key} help`,
  values: { 'EG-01': { value: 1, label: `${key}: 1` } },
});

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BedMap
        siteId="s1"
        layers={[layer('a'), layer('b'), layer('c')]}
        overlays={[]}
        defaultOn={['a']}
      />
    </QueryClientProvider>,
  );
  return within(screen.getByTestId('indicator-panel'));
}

describe('indicator overlays', () => {
  it('lists each indicator with its explanation; the first ticked fills, the second outlines', () => {
    const p = renderIt();
    expect(p.getByText('b help')).toBeInTheDocument();
    expect(p.getByRole('checkbox', { name: /^A/ })).toBeChecked();
    fireEvent.click(p.getByRole('checkbox', { name: /^B/ }));
    expect(p.getByRole('checkbox', { name: /^A/ }).closest('label')).toHaveTextContent('Fill');
    expect(p.getByRole('checkbox', { name: /^B/ }).closest('label')).toHaveTextContent('Outline');
  });

  it('at most two: a third replaces the oldest', () => {
    const p = renderIt();
    fireEvent.click(p.getByRole('checkbox', { name: /^B/ }));
    fireEvent.click(p.getByRole('checkbox', { name: /^C/ }));
    expect(p.getByRole('checkbox', { name: /^A/ })).not.toBeChecked();
    expect(p.getByRole('checkbox', { name: /^B/ }).closest('label')).toHaveTextContent('Fill');
    expect(p.getByRole('checkbox', { name: /^C/ }).closest('label')).toHaveTextContent('Outline');
  });
});
