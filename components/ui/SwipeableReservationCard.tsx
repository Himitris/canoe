import React, { useRef } from 'react';
import { View, StyleSheet, Animated, Alert } from 'react-native';
import { Card, Text, IconButton, useTheme } from 'react-native-paper';
import {
  Swipeable,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Reservation } from '../../services/DatabaseService';
import { StatusChip } from './StatusChip';

interface SwipeableReservationCardProps {
  reservation: Reservation;
  onStatusChange: (id: number, status: Reservation['status']) => void;
  onDuplicate: (id: number) => void;
  onEdit?: (id: number) => void;
}

export function SwipeableReservationCard({
  reservation,
  onStatusChange,
  onDuplicate,
  onEdit,
}: SwipeableReservationCardProps) {
  const theme = useTheme();
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    progress: Animated.AnimatedAddition<number>,
    dragX: Animated.AnimatedAddition<number>
  ) => {
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    return (
      <View style={styles.rightActions}>
        <Animated.View
          style={[styles.actionButton, { transform: [{ scale }] }]}
        >
          <IconButton
            icon="content-duplicate"
            size={20}
            iconColor="white"
            style={[
              styles.actionIcon,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => {
              swipeableRef.current?.close();
              onDuplicate(reservation.id!);
            }}
          />
        </Animated.View>

        {reservation.status === 'pending' && (
          <Animated.View
            style={[styles.actionButton, { transform: [{ scale }] }]}
          >
            <IconButton
              icon="play"
              size={20}
              iconColor="white"
              style={[styles.actionIcon, { backgroundColor: '#4CAF50' }]}
              onPress={() => {
                swipeableRef.current?.close();
                onStatusChange(reservation.id!, 'on_water');
              }}
            />
          </Animated.View>
        )}

        {reservation.status === 'on_water' && (
          <Animated.View
            style={[styles.actionButton, { transform: [{ scale }] }]}
          >
            <IconButton
              icon="check"
              size={20}
              iconColor="white"
              style={[styles.actionIcon, { backgroundColor: '#2196F3' }]}
              onPress={() => {
                swipeableRef.current?.close();
                onStatusChange(reservation.id!, 'completed');
              }}
            />
          </Animated.View>
        )}
      </View>
    );
  };

  const renderLeftActions = (
    progress: Animated.AnimatedAddition<number>,
    dragX: Animated.AnimatedAddition<number>
  ) => {
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    return (
      <View style={styles.leftActions}>
        {onEdit && (
          <Animated.View
            style={[styles.actionButton, { transform: [{ scale }] }]}
          >
            <IconButton
              icon="pencil"
              size={20}
              iconColor="white"
              style={[
                styles.actionIcon,
                { backgroundColor: theme.colors.tertiary },
              ]}
              onPress={() => {
                swipeableRef.current?.close();
                onEdit(reservation.id!);
              }}
            />
          </Animated.View>
        )}

        {reservation.status !== 'canceled' && (
          <Animated.View
            style={[styles.actionButton, { transform: [{ scale }] }]}
          >
            <IconButton
              icon="close"
              size={20}
              iconColor="white"
              style={[styles.actionIcon, { backgroundColor: '#F44336' }]}
              onPress={() => {
                swipeableRef.current?.close();
                Alert.alert(
                  'Annuler la réservation',
                  `Êtes-vous sûr de vouloir annuler la réservation de ${reservation.name} ?`,
                  [
                    { text: 'Non', style: 'cancel' },
                    {
                      text: 'Oui',
                      style: 'destructive',
                      onPress: () =>
                        onStatusChange(reservation.id!, 'canceled'),
                    },
                  ]
                );
              }}
            />
          </Animated.View>
        )}
      </View>
    );
  };

  const timeSlotLabels = {
    morning: 'Matin',
    afternoon: 'Après-midi',
    full_day: 'Journée complète',
  };

  return (
    <GestureHandlerRootView>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        rightThreshold={40}
        leftThreshold={40}
      >
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <View style={styles.header}>
              <View style={styles.customerInfo}>
                <Text variant="headlineSmall" style={styles.customerName}>
                  {reservation.name}
                </Text>
                <Text variant="bodyMedium" style={styles.dateTime}>
                  {format(new Date(reservation.date), 'dd MMM yyyy', {
                    locale: fr,
                  })}{' '}
                  • {reservation.arrival_time}
                </Text>
              </View>
              <StatusChip status={reservation.status} />
            </View>

            <View style={styles.details}>
              <View style={styles.detailItem}>
                <Text variant="labelMedium" style={styles.detailLabel}>
                  Personnes
                </Text>
                <Text variant="bodyLarge" style={styles.detailValue}>
                  {reservation.nb_people}
                </Text>
              </View>

              <View style={styles.detailItem}>
                <Text variant="labelMedium" style={styles.detailLabel}>
                  Canoës
                </Text>
                <Text variant="bodyLarge" style={styles.detailValue}>
                  {reservation.single_canoes}S + {reservation.double_canoes}D
                </Text>
              </View>

              <View style={styles.detailItem}>
                <Text variant="labelMedium" style={styles.detailLabel}>
                  Créneau
                </Text>
                <Text variant="bodyLarge" style={styles.detailValue}>
                  {timeSlotLabels[reservation.timeslot]}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </Swipeable>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  customerInfo: {
    flex: 1,
    marginRight: 12,
  },
  customerName: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  dateTime: {
    color: '#666',
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    color: '#666',
    marginBottom: 2,
  },
  detailValue: {
    fontWeight: '600',
    color: '#1976D2',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  actionButton: {
    marginHorizontal: 4,
  },
  actionIcon: {
    margin: 0,
  },
});
