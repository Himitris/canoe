import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, ProgressBar, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface AvailabilityData {
  morning: { single: number; double: number; total_single: number; total_double: number };
  afternoon: { single: number; double: number; total_single: number; total_double: number };
  full_day: { single: number; double: number; total_single: number; total_double: number };
}

interface AvailabilityWidgetProps {
  availability: AvailabilityData | null;
  selectedDate: string;
}

export function AvailabilityWidget({ availability, selectedDate }: AvailabilityWidgetProps) {
  const theme = useTheme();

  if (!availability) {
    return (
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text>Loading availability...</Text>
        </Card.Content>
      </Card>
    );
  }

  const getOccupancyColor = (used: number, total: number) => {
    const percentage = used / total;
    if (percentage >= 0.9) return theme.colors.error;
    if (percentage >= 0.7) return theme.colors.warning;
    return theme.colors.success;
  };

  const renderTimeSlot = (
    title: string,
    icon: string,
    data: { single: number; double: number; total_single: number; total_double: number }
  ) => {
    const singleUsed = data.total_single - data.single;
    const doubleUsed = data.total_double - data.double;
    const singleProgress = data.total_single > 0 ? singleUsed / data.total_single : 0;
    const doubleProgress = data.total_double > 0 ? doubleUsed / data.total_double : 0;

    return (
      <View style={styles.timeSlot}>
        <View style={styles.timeSlotHeader}>
          <MaterialCommunityIcons
            name={icon as any}
            size={16}
            color={theme.colors.primary}
          />
          <Text variant="labelMedium" style={styles.timeSlotTitle}>
            {title}
          </Text>
        </View>
        
        <View style={styles.progressContainer}>
          <View style={styles.progressItem}>
            <Text variant="labelSmall" style={styles.progressLabel}>
              Single
            </Text>
            <ProgressBar
              progress={singleProgress}
              color={getOccupancyColor(singleUsed, data.total_single)}
              style={styles.progressBar}
            />
            <Text variant="labelSmall" style={styles.progressText}>
              {data.single}/{data.total_single}
            </Text>
          </View>
          
          <View style={styles.progressItem}>
            <Text variant="labelSmall" style={styles.progressLabel}>
              Double
            </Text>
            <ProgressBar
              progress={doubleProgress}
              color={getOccupancyColor(doubleUsed, data.total_double)}
              style={styles.progressBar}
            />
            <Text variant="labelSmall" style={styles.progressText}>
              {data.double}/{data.total_double}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="chart-donut"
            size={20}
            color={theme.colors.primary}
          />
          <Text variant="titleMedium" style={styles.title}>
            Live Availability
          </Text>
        </View>
        
        <View style={styles.timeSlots}>
          {renderTimeSlot('Morning', 'weather-sunny', availability.morning)}
          {renderTimeSlot('Afternoon', 'weather-sunset', availability.afternoon)}
          {renderTimeSlot('Full Day', 'clock-outline', availability.full_day)}
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  title: {
    fontWeight: '600',
    color: '#1976D2',
  },
  timeSlots: {
    gap: 12,
  },
  timeSlot: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
  },
  timeSlotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  timeSlotTitle: {
    fontWeight: '500',
  },
  progressContainer: {
    gap: 6,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressLabel: {
    minWidth: 40,
    color: '#666',
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  progressText: {
    minWidth: 35,
    textAlign: 'right',
    fontWeight: '500',
  },
});