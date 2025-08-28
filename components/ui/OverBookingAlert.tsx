import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface OverBookingAlertProps {
  isVisible: boolean;
  message: string;
}

export function OverBookingAlert({ isVisible, message }: OverBookingAlertProps) {
  const theme = useTheme();

  if (!isVisible) return null;

  return (
    <Card style={[styles.card, { backgroundColor: theme.colors.errorContainer }]} mode="elevated">
      <Card.Content>
        <View style={styles.content}>
          <MaterialCommunityIcons
            name="alert-circle"
            size={24}
            color={theme.colors.error}
          />
          <View style={styles.textContainer}>
            <Text variant="titleSmall" style={[styles.title, { color: theme.colors.error }]}>
              Overbooking Alert
            </Text>
            <Text variant="bodyMedium" style={[styles.message, { color: theme.colors.onErrorContainer }]}>
              {message}
            </Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
  },
});