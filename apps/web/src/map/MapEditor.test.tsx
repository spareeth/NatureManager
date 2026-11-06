import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { MapEditor } from './MapEditor';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <MapEditor
          map={null}
          orgId="o1"
          siteId="s1"
          canEdit
          toolbarExtra={<button type="button">Report a problem here</button>}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('map editor toolbar', () => {
  it('one Add asset button; the three ways to add are in its menu', () => {
    renderIt();
    expect(screen.queryByRole('button', { name: 'Draw planting group' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report a problem here' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add asset' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Tap a point on the map',
      'Draw planting group',
      'Add by offset',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Draw planting group' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add asset' })).not.toBeInTheDocument(); // drawing mode
  });
});
