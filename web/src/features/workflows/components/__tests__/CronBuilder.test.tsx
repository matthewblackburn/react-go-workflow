import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CronBuilder } from '../CronBuilder';

describe('CronBuilder', () => {
  it('renders with builder mode by default (frequency dropdown visible)', () => {
    const onChange = vi.fn();
    render(<CronBuilder value="0 9 * * *" onChange={onChange} />);

    // Builder button should have active styling, and "Run every" label should be visible
    expect(screen.getByText('Builder')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('Run every')).toBeInTheDocument();
  });

  it('renders custom mode input when switching to Custom tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CronBuilder value="0 9 * * *" onChange={onChange} />);

    await user.click(screen.getByText('Custom'));

    expect(screen.getByText('Cron Expression')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0 9 * * 1-5')).toBeInTheDocument();
    // Builder-specific labels should no longer be visible
    expect(screen.queryByText('Run every')).not.toBeInTheDocument();
  });

  it('typing in custom mode calls onChange with the entered value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CronBuilder value="0 9 * * *" onChange={onChange} />);

    // Switch to custom mode
    await user.click(screen.getByText('Custom'));

    // Type a character in the input — since the input is controlled via value prop,
    // each keystroke calls onChange with the full current input value
    const input = screen.getByPlaceholderText('0 9 * * 1-5');
    await user.type(input, '!');

    // onChange should have been called with the appended character
    const calls = onChange.mock.calls.map((c) => c[0]);
    expect(calls).toContain('0 9 * * *!');
  });

  it('displays human-readable preview text', () => {
    const onChange = vi.fn();
    render(<CronBuilder value="0 9 * * *" onChange={onChange} />);

    // cronstrue converts "0 9 * * *" to something like "At 09:00 AM"
    expect(screen.getByText(/at 09:00/i)).toBeInTheDocument();
  });

  it('emits default expression "0 9 * * *" on mount when value is empty', () => {
    const onChange = vi.fn();
    render(<CronBuilder value="" onChange={onChange} />);

    expect(onChange).toHaveBeenCalledWith('0 9 * * *');
  });
});
