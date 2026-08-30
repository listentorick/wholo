import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RegisterForm } from './RegisterForm';
import { CONFIRMATION, REGISTER } from '@/content';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/your name/i), 'Jo Smith');
  await user.type(screen.getByLabelText(/work email/i), 'jo@winos.co.uk');
  await user.type(screen.getByLabelText(/business name/i), 'Winos Ltd');
}

describe('RegisterForm', () => {
  it('renders the fields, interest options and honeypot', () => {
    const { container } = render(<RegisterForm />);
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    for (const interest of REGISTER.interests) {
      expect(screen.getByText(interest)).toBeInTheDocument();
    }
    expect(container.querySelector('input[name="company_url"]')).toBeInTheDocument();
  });

  it('blocks submit and shows inline errors when required fields are empty', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.click(screen.getByRole('button', { name: /register interest/i }));
    expect(await screen.findByText(/please enter your name/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to /api/register and shows the confirmation state on success', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const user = userEvent.setup();
    render(<RegisterForm />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /register interest/i }));

    expect(await screen.findByText(CONFIRMATION.heading)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/register', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({ name: 'Jo Smith', email: 'jo@winos.co.uk', business: 'Winos Ltd' });
    expect(typeof body.elapsedMs).toBe('number');
  });

  it('surfaces a general error message when the request fails', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'send_failed' }), { status: 502 }),
    );
    const user = userEvent.setup();
    render(<RegisterForm />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /register interest/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  });
});
