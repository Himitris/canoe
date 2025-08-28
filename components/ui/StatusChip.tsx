import React from 'react';
import { Chip } from 'react-native-paper';

const statusConfig = {
  pending: {
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    label: 'Pending',
    icon: 'clock-outline',
  },
  ongoing: {
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    label: 'Ongoing',
    icon: 'play',
  },
  completed: {
    color: '#4CAF50',
    backgroundColor: '#E8F5E8',
    label: 'Completed',
    icon: 'check',
  },
  canceled: {
    color: '#F44336',
    backgroundColor: '#FFEBEE',
    label: 'Canceled',
    icon: 'close',
  },
};

interface StatusChipProps {
  status: 'pending' | 'ongoing' | 'completed' | 'canceled';
  size?: 'small' | 'medium';
}

export function StatusChip({ status, size = 'medium' }: StatusChipProps) {
  const config = statusConfig[status];

  return (
    <Chip
      icon={config.icon}
      textStyle={{ 
        color: config.color, 
        fontSize: size === 'small' ? 11 : 13,
        fontWeight: '500'
      }}
      style={{ 
        backgroundColor: config.backgroundColor,
        borderColor: config.color,
        borderWidth: 1,
      }}
      compact={size === 'small'}
    >
      {config.label}
    </Chip>
  );
}