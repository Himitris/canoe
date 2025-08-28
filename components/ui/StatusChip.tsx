import React from 'react';
import { Chip } from 'react-native-paper';

const statusConfig = {
  pending: {
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    label: 'En attente',
    icon: 'clock-outline',
  },
  on_water: {
    color: '#4CAF50',
    backgroundColor: '#E8F5E8',
    label: "Sur l'eau",
    icon: 'sail-boat',
  },
  completed: {
    color: '#9E9E9E',
    backgroundColor: '#F5F5F5',
    label: 'Terminé',
    icon: 'check-circle',
  },
  canceled: {
    color: '#F44336',
    backgroundColor: '#FFEBEE',
    label: 'Annulé',
    icon: 'close-circle',
  },
  // Support des anciens statuts pour compatibilité
  arrived: {
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    label: "Sur l'eau",
    icon: 'sail-boat',
  },
  ongoing: {
    color: '#4CAF50',
    backgroundColor: '#E8F5E8',
    label: "Sur l'eau",
    icon: 'sail-boat',
  },
};

interface StatusChipProps {
  status:
    | 'pending'
    | 'on_water'
    | 'completed'
    | 'canceled'
    | 'arrived'
    | 'ongoing';
  size?: 'small' | 'medium';
}

export function StatusChip({ status, size = 'medium' }: StatusChipProps) {
  // Convertir les anciens statuts vers les nouveaux
  const normalizedStatus =
    status === 'ongoing' || status === 'arrived' ? 'on_water' : status;
  const config = statusConfig[normalizedStatus] || statusConfig.pending;

  return (
    <Chip
      icon={config.icon}
      textStyle={{
        color: config.color,
        fontSize: size === 'small' ? 11 : 13,
        fontWeight: '500',
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
