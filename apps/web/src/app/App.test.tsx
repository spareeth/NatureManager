import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import i18n, { directionFor } from '../i18n';
import { membership, renderApp } from '../test/renderApp';

vi.mock('../components/LeafletMap', () => ({ LeafletMap: () => <div data-testid="map" /> }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
  },
}));

const navLinks = () =>
  within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((a) => a.textContent);

describe('login', () => {
  it('shows the magic link form when signed out', () => {
    renderApp({ session: false });
    expect(screen.getByLabelText('Work email')).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('sends a magic link and confirms', async () => {
    const { auth } = renderApp({ session: false });
    fireEvent.change(screen.getByLabelText('Work email'), {
      target: { value: ' green1@terra.test ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('green1@terra.test'));
    expect(auth.signInWithEmail).toHaveBeenCalledWith('green1@terra.test');
  });

  it('shows the error when sending fails', async () => {
    renderApp({
      session: false,
      auth: { signInWithEmail: async () => ({ error: 'Rate limit exceeded' }) },
    });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'x@y.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rate limit exceeded');
  });
});

it('login page offers Arabic before sign-in', async () => {
  renderApp({ session: false });
  fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
  await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
  await i18n.changeLanguage('en');
});

describe('shell', () => {
  it('signed-in user with no organisation is told so', () => {
    renderApp({ memberships: [] });
    expect(screen.getByText(/not a member of any organisation/)).toBeInTheDocument();
  });

  it('green team sees map and field app, not members', () => {
    renderApp({ memberships: [membership(['green_team'])] });
    expect(navLinks()).toEqual(['Map', 'Assets', 'Taxa', 'Work', 'Field app']);
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('manager sees members', async () => {
    renderApp({ path: '/members', memberships: [membership(['manager'])] });
    expect(navLinks()).toEqual([
      'Map',
      'Assets',
      'Taxa',
      'Work',
      'Field app',
      'Planning',
      'Control points',
      'Members',
    ]);
    expect(await screen.findByRole('heading', { name: 'Members' })).toBeInTheDocument();
  });

  it('a route outside the role redirects to the map', () => {
    renderApp({ path: '/members', memberships: [membership(['green_team'])] });
    expect(screen.queryByRole('heading', { name: 'Members' })).not.toBeInTheDocument();
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('owner cannot open the field app', () => {
    renderApp({ path: '/field', memberships: [membership(['owner'])] });
    expect(navLinks()).toEqual(['Map', 'Assets', 'Taxa', 'Work']);
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('organisation switcher appears with two organisations and switches', () => {
    const terra = membership(['manager'], 'org-t', 'Terra');
    const demo = membership(['owner'], 'org-d', 'Demo Org');
    const { org } = renderApp({ memberships: [terra, demo] });
    const select = screen.getByRole('combobox', { name: 'Organisation' });
    fireEvent.change(select, { target: { value: 'org-d' } });
    expect(org.switchOrg).toHaveBeenCalledWith('org-d');
  });

  it('single organisation shows its name, no switcher', () => {
    renderApp({ memberships: [membership(['manager'])] });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Terra')).toBeInTheDocument();
  });

  it('sign out calls auth', () => {
    const { auth } = renderApp({ memberships: [membership(['curator'])] });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.signOut).toHaveBeenCalled();
  });
});

describe('i18n direction', () => {
  it('maps Arabic to rtl and English to ltr', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('ar-AE')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });

  it('sets document dir when switching language', async () => {
    await i18n.changeLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
