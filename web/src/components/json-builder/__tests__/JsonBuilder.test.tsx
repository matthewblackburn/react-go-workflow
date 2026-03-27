import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JsonBuilder, RULES_SCHEMA } from '../JsonBuilder';

describe('JsonBuilder', () => {
  it('renders empty state with Add button visible', () => {
    render(<JsonBuilder value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('clicking Add opens type picker popup', async () => {
    const user = userEvent.setup();
    render(<JsonBuilder value={undefined} onChange={vi.fn()} />);

    await user.click(screen.getByText('Add'));

    // The type picker shows type options
    expect(screen.getByText('String')).toBeInTheDocument();
    expect(screen.getByText('Number')).toBeInTheDocument();
    expect(screen.getByText('Boolean')).toBeInTheDocument();
    expect(screen.getByText('Object')).toBeInTheDocument();
    expect(screen.getByText('Array')).toBeInTheDocument();
  });

  it('after adding a string field, a name input appears', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<JsonBuilder value={undefined} onChange={onChange} />);

    await user.click(screen.getByText('Add'));
    await user.click(screen.getByText('String'));

    // onChange should have been called with the new field
    expect(onChange).toHaveBeenCalled();
    // A name input placeholder should now be visible
    expect(screen.getByPlaceholderText('name')).toBeInTheDocument();
  });

  it('calls onChange when fields are modified', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<JsonBuilder value={undefined} onChange={onChange} />);

    // Add a string field
    await user.click(screen.getByText('Add'));
    await user.click(screen.getByText('String'));

    expect(onChange).toHaveBeenCalled();
  });

  it('renders existing schema fields when value prop is provided', () => {
    const schema = {
      type: 'object',
      properties: {
        username: { type: 'string', description: '' },
        age: { type: 'number', description: '' },
      },
    };
    render(<JsonBuilder value={schema} onChange={vi.fn()} />);

    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.getByText('age')).toBeInTheDocument();
  });

  it('Clear button removes all fields', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const schema = {
      type: 'object',
      properties: {
        username: { type: 'string', description: '' },
      },
    };
    render(<JsonBuilder value={schema} onChange={onChange} />);

    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();

    await user.click(screen.getByText('Clear'));

    // onChange should be called with undefined (no fields left)
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
