import { type ColumnDef } from '@tanstack/react-table';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { DataGrid } from '../DataGrid';

interface TestRow {
  id: string;
  name: string;
  email: string;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
];

const mockData: TestRow[] = [
  { id: '1', name: 'Alice', email: 'alice@test.com' },
  { id: '2', name: 'Bob', email: 'bob@test.com' },
  { id: '3', name: 'Charlie', email: 'charlie@test.com' },
];

describe('DataGrid', () => {
  it('renders column headers from column definitions', () => {
    renderWithProviders(<DataGrid columns={columns} data={mockData} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders correct number of rows from data', () => {
    renderWithProviders(<DataGrid columns={columns} data={mockData} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
  });

  it('shows empty message when data is empty array', () => {
    renderWithProviders(<DataGrid columns={columns} data={[]} />);

    expect(screen.getByText('No results.')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    renderWithProviders(<DataGrid columns={columns} data={mockData} title="Users" />);

    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();

    renderWithProviders(
      <DataGrid columns={columns} data={mockData} onRowClick={onRowClick} />,
    );

    await user.click(screen.getByText('Alice'));

    expect(onRowClick).toHaveBeenCalledWith(mockData[0]);
  });

  it('shows loading state when isLoading is true', () => {
    const { container } = renderWithProviders(
      <DataGrid columns={columns} data={[]} isLoading={true} />,
    );

    // Loading state renders skeleton rows with animate-pulse class
    const skeletonElements = container.querySelectorAll('.animate-pulse');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });
});
