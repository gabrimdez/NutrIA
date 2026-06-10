import React from 'react';
import { EmptyStateUI } from './ui/EmptyStateUI';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState(props: EmptyStateProps) {
  return <EmptyStateUI {...props} />;
}
