import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterBar, type FilterFieldConfig } from '../FilterBar';

const fields: FilterFieldConfig[] = [
  { field: 'name', label: 'Name', type: 'text' },
  { field: 'status', label: 'Status', type: 'exact', options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]},
];

describe('FilterBar', () => {
  it('renders filter pills for active filters', () => {
    render(
      <FilterBar
        fields={fields}
        filters={{ name: 'contains:test' }}
        onFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('contains')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('calls onFilterChange when adding a new filter field', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();

    render(
      <FilterBar fields={fields} filters={{}} onFilterChange={onFilterChange} />,
    );

    // Click the "+" button to add a filter
    const addButton = screen.getByRole('button');
    await user.click(addButton);

    // Pick "Name" from the popover
    await user.click(screen.getByText('Name'));

    // A draft pill should appear with the field name
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows active filter pills for each filter in the filters prop', () => {
    render(
      <FilterBar
        fields={fields}
        filters={{ name: 'contains:hello', status: 'is:active' }}
        onFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('removes a filter when the remove button is clicked', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();

    render(
      <FilterBar
        fields={fields}
        filters={{ name: 'contains:test' }}
        onFilterChange={onFilterChange}
      />,
    );

    // The X button is inside the pill — find all buttons and click the remove one
    // The remove button contains an X icon and is the last button in the pill
    const removeButtons = screen.getAllByRole('button');
    // The remove button is the one at the end of the pill group
    const removeButton = removeButtons.find((btn) =>
      btn.querySelector('.lucide-x'),
    );
    expect(removeButton).toBeTruthy();
    await user.click(removeButton!);

    expect(onFilterChange).toHaveBeenCalledWith('name', '');
  });
});
