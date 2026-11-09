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
  resolveBasemaps: () => ({
    layers: [
      { id: 'b1', name: 'Dec 2025', kind: 'pmtiles', url: '/tiles/d.pmtiles' },
      { id: 'b2', name: 'Google satellite', kind: 'google', url: null },
    ],
    defaultId: 'b1',
  }),
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
        pointLayers={[
          {
            key: 'loss',
            group: 'Tree loss',
            label: 'Trees lost',
            help: 'lost help',
            points: [{ lon: 55, lat: 25, color: '#c2410c', label: 'Lost by Apr' }],
            classes: [{ color: '#c2410c', label: 'Lost by Apr' }],
          },
        ]}
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

  it('a point layer is switched on and off on its own, with its legend', () => {
    const p = renderIt();
    const box = p.getByRole('checkbox', { name: /Trees lost/ });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(p.getByRole('checkbox', { name: /^A/ })).toBeChecked(); // the indicators are untouched
    expect(screen.getAllByText('Lost by Apr').length).toBeGreaterThan(0);
  });

  it('compare: a second base map with a divider, never the same as the base map', async () => {
    renderIt();
    const base = screen.getByLabelText('Base map');
    const cmp = screen.getByLabelText('Compare with');
    await screen.findAllByRole('option', { name: 'Google satellite', hidden: true });
    fireEvent.change(base, { target: { value: 'b1' } });
    const names = Array.from((cmp as HTMLSelectElement).options).map((o) => o.textContent);
    expect(names).toEqual(['No comparison', 'Google satellite']);
    fireEvent.change(cmp, { target: { value: 'b2' } });
    expect(screen.getByLabelText(/Move the divider/)).toBeInTheDocument();
  });
});
