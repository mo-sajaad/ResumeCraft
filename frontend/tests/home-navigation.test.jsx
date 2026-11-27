// SHELL-009 / SHELL-010: the Home header's Features disclosure and the mobile
// "Menu" button. Both report their state with aria-expanded, point at the panel
// they control, close on Escape (returning focus to the button), on a click
// outside the header and when a link is chosen. Features also closes when focus
// leaves it. Home renders static content only; nothing here touches a network.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Home from '../src/pages/Home.jsx';

function renderHome() {
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
  const header = document.querySelector('header.top-nav');
  return {
    header,
    features: screen.getByRole('button', { name: 'Features' }),
    menu: screen.getByRole('button', { name: 'Menu' }),
  };
}

// Footer and body repeat some link names, so query inside the header.
const navLink = (name) => within(document.querySelector('header.top-nav')).getByRole('link', { name });

const controlled = (button) => document.getElementById(button.getAttribute('aria-controls'));

describe('Home Features menu button', () => {
  it('toggles aria-expanded and controls the features menu', () => {
    const { features } = renderHome();
    const panel = controlled(features);

    expect(features).toHaveAttribute('aria-controls', 'home-features-menu');
    expect(panel).not.toBeNull();
    expect(panel).toContainElement(navLink('Interview Prep'));
    expect(features).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toHaveClass('is-open');

    fireEvent.click(features);
    expect(features).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveClass('is-open');

    fireEvent.click(features);
    expect(features).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toHaveClass('is-open');
  });

  it('closes on Escape and returns focus to the button', () => {
    const { features } = renderHome();
    fireEvent.click(features);
    const link = navLink('Cover Letter Generator');
    act(() => link.focus());
    expect(link).toHaveFocus();
    expect(features).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(features).toHaveAttribute('aria-expanded', 'false');
    expect(features).toHaveFocus();
  });

  it('ignores keys other than Escape', () => {
    const { features } = renderHome();
    fireEvent.click(features);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(features).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on a pointer press outside the header but not inside it', () => {
    const { features, header } = renderHome();
    fireEvent.click(features);

    fireEvent.pointerDown(header.querySelector('.brand'));
    expect(features).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(document.querySelector('main'));
    expect(features).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when a feature link is chosen', () => {
    const { features } = renderHome();
    fireEvent.click(features);
    fireEvent.click(navLink('Job Description Parser'));
    expect(features).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays open while focus moves inside it and closes when focus leaves', () => {
    const { features } = renderHome();
    act(() => features.focus());
    fireEvent.click(features);

    act(() => navLink('Portfolio Audit').focus());
    expect(features).toHaveAttribute('aria-expanded', 'true');

    act(() => navLink('Pricing').focus());
    expect(features).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Home mobile Menu button', () => {
  it('toggles aria-expanded and controls the navigation panel', () => {
    const { menu } = renderHome();
    const panel = controlled(menu);

    expect(menu).toHaveAttribute('aria-controls', 'home-nav-panel');
    expect(panel).not.toBeNull();
    expect(panel).toContainElement(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toHaveClass('is-open');

    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveClass('is-open');

    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toHaveClass('is-open');
  });

  it('closes on Escape and returns focus to the Menu button', () => {
    const { menu } = renderHome();
    fireEvent.click(menu);
    const link = navLink('FAQ');
    act(() => link.focus());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('with Features open inside it, Escape closes Features first, then the panel', () => {
    const { menu, features } = renderHome();
    fireEvent.click(menu);
    fireEvent.click(features);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(features).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(features).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('closes when a link is chosen', () => {
    const { menu } = renderHome();
    fireEvent.click(menu);
    fireEvent.click(navLink('Pricing'));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when a feature link inside it is chosen', () => {
    const { menu, features } = renderHome();
    fireEvent.click(menu);
    fireEvent.click(features);
    fireEvent.click(navLink('Competitive Analysis'));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(features).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a pointer press outside the header', () => {
    const { menu } = renderHome();
    fireEvent.click(menu);
    fireEvent.pointerDown(document.querySelector('main'));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});
