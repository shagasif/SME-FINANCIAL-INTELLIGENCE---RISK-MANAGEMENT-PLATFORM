import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './StatCard';

describe('StatCard component', () => {
  it('renders title and formatted value correctly', () => {
    render(<StatCard title="Cash Balance" value="$125,400" />);
    expect(screen.getByText('Cash Balance')).toBeInTheDocument();
    expect(screen.getByText('$125,400')).toBeInTheDocument();
  });

  it('renders change percentage and subtitle', () => {
    render(
      <StatCard
        title="Revenue (30d)"
        value="$45,200"
        change={{ value: '+12.4%', isPositive: true }}
        subtitle="vs last month"
      />,
    );
    expect(screen.getByText('+12.4%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('renders negative delta with downward indicator styling', () => {
    render(
      <StatCard
        title="Net Cash Flow"
        value="-$4,300"
        change={{ value: '-8.1%', isPositive: false }}
      />,
    );
    expect(screen.getByText('-8.1%')).toBeInTheDocument();
  });

  it('displays limitations note when provided', () => {
    render(
      <StatCard
        title="Quick Ratio"
        value="1.82"
        dataLimitation="Excludes illiquid inventory and pending disputes"
      />,
    );
    expect(screen.getByText(/Excludes illiquid inventory/i)).toBeInTheDocument();
  });
});
