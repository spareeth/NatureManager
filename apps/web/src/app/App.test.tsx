import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n, { directionFor } from '../i18n';
import { App } from './App';

vi.mock('../components/LeafletMap', () => ({ LeafletMap: () => <div data-testid="map" /> }));

describe('App shell', () => {
  it('renders the map page at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('renders the field page at /field', () => {
    render(
      <MemoryRouter initialEntries={['/field']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Field app' })).toBeInTheDocument();
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
