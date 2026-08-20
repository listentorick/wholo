import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeliveryRunColumn } from '@wholo/types';
import { MoveToMenu } from './MoveToMenu';

function makeRun(overrides: Partial<DeliveryRunColumn> = {}): DeliveryRunColumn {
  return {
    runId: 'run-1',
    routeId: 'route-1',
    name: 'Yorkshire',
    driverName: null,
    status: 'OPEN',
    version: 0,
    cards: [],
    stopCount: 0,
    itemCount: 0,
    ...overrides,
  };
}

describe('MoveToMenu', () => {
  it('renders the trigger without requiring hover', () => {
    render(<MoveToMenu currentRunId={null} runs={[]} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Move to…' })).toBeInTheDocument();
  });

  it('lists every other run plus Unassigned when the card is currently in a run', async () => {
    render(<MoveToMenu currentRunId="run-1" runs={[makeRun(), makeRun({ runId: 'run-2', name: 'Lancashire' })]} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }));

    expect(screen.getByRole('menuitem', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Lancashire' })).toBeInTheDocument();
    // The run the card is already in is not offered as a target.
    expect(screen.queryByRole('menuitem', { name: 'Yorkshire' })).not.toBeInTheDocument();
  });

  it('does not offer Unassigned when the card is already unassigned', async () => {
    render(<MoveToMenu currentRunId={null} runs={[makeRun()]} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    expect(screen.queryByRole('menuitem', { name: 'Unassigned' })).not.toBeInTheDocument();
  });

  it('pins the suggested run first and labels it Suggested', async () => {
    render(<MoveToMenu
      currentRunId={null}
      runs={[makeRun({ runId: 'run-2', name: 'Lancashire' }), makeRun({ runId: 'run-1', name: 'Yorkshire' })]}
      suggestedRunId="run-1"
      onSelect={vi.fn()}
    />);
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }));

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Yorkshire');
    expect(items[0]).toHaveTextContent('Suggested');
  });

  it('disables a READY run with an explanatory title, and does not select it on click', async () => {
    const onSelect = vi.fn();
    render(<MoveToMenu currentRunId={null} runs={[makeRun({ status: 'READY' })]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }));

    const item = screen.getByRole('menuitem', { name: 'Yorkshire' });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', 'Run already marked ready');
  });

  it('calls onSelect with the run id and closes the menu', async () => {
    const onSelect = vi.fn();
    render(<MoveToMenu currentRunId={null} runs={[makeRun()]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Yorkshire' }));

    expect(onSelect).toHaveBeenCalledWith('run-1');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onSelect with null when Unassigned is picked', async () => {
    const onSelect = vi.fn();
    render(<MoveToMenu currentRunId="run-1" runs={[makeRun()]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unassigned' }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('is disabled when the disabled prop is set', () => {
    render(<MoveToMenu currentRunId={null} runs={[]} disabled onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Move to…' })).toBeDisabled();
  });
});
