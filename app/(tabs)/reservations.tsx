import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import {
  Card,
  Text,
  Chip,
  IconButton,
  FAB,
  Searchbar,
  useTheme,
  Menu,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { Reservation } from '../../services/DatabaseService';

const statusColors = {
  pending: '#FF9800',
  on_water: '#4CAF50',
  completed: '#9E9E9E',
  canceled: '#F44336',
};

const statusLabels = {
  pending: 'En attente',
  on_water: "Sur l'eau",
  completed: 'Terminé',
  canceled: 'Annulé',
};

const timeSlotLabels = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  full_day: 'Journée complète',
};

export default function Reservations() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<
    Reservation[]
  >([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [menuVisible, setMenuVisible] = useState<{ [key: number]: boolean }>(
    {}
  );

  const loadReservations = async () => {
    if (!db) return;

    try {
      const data = await db.getReservations();
      setReservations(data);
      filterReservations(data, searchQuery, statusFilter);
    } catch (error) {
      console.error('Erreur lors du chargement des réservations:', error);
    }
  };

  const filterReservations = (
    data: Reservation[],
    query: string,
    status: string
  ) => {
    let filtered = data;

    if (status !== 'all') {
      filtered = filtered.filter((r) => r.status === status);
    }

    if (query.trim()) {
      const searchLower = query.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) || r.date.includes(query)
      );
    }

    setFilteredReservations(filtered);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReservations();
    setRefreshing(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadReservations();
      }
    }, [isReady, db])
  );

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    filterReservations(reservations, query, statusFilter);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    filterReservations(reservations, searchQuery, status);
  };

  const updateReservationStatus = async (
    id: number,
    status: Reservation['status']
  ) => {
    if (!db) return;

    try {
      // Utiliser les nouvelles méthodes spécialisées
      if (status === 'on_water') {
        await db.markReservationOnWater(id);
      } else if (status === 'completed') {
        await db.markReservationCompleted(id);
      } else {
        // Pour pending et canceled, utiliser l'ancienne méthode
        await db.updateReservation(id, { status });
      }

      await loadReservations();
      setMenuVisible((prev) => ({ ...prev, [id]: false }));
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
    }
  };

  const toggleMenu = (id: number) => {
    setMenuVisible((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getDurationOnWater = (item: Reservation) => {
    if (!item.departure_time) return null;

    const departure = new Date(item.departure_time);
    const now = item.return_time ? new Date(item.return_time) : new Date();
    const diffMinutes = Math.floor(
      (now.getTime() - departure.getTime()) / (1000 * 60)
    );

    if (diffMinutes < 60) return `${diffMinutes}min`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}`;
  };

  const renderReservationItem = ({ item }: { item: Reservation }) => (
    <Card style={styles.reservationCard} mode="elevated">
      <Card.Content>
        <View style={styles.reservationHeader}>
          <View style={styles.reservationInfo}>
            <Text variant="headlineSmall" style={styles.customerName}>
              {item.name}
            </Text>
            <Text variant="bodyMedium" style={styles.reservationDate}>
              {format(new Date(item.date), 'dd MMM yyyy', { locale: fr })} •{' '}
              {item.arrival_time}
            </Text>
            {item.status === 'on_water' && getDurationOnWater(item) && (
              <Text
                variant="bodySmall"
                style={[styles.durationText, { color: theme.colors.primary }]}
              >
                Sur l'eau depuis {getDurationOnWater(item)}
              </Text>
            )}
          </View>
          <Menu
            visible={menuVisible[item.id!] || false}
            onDismiss={() => toggleMenu(item.id!)}
            anchor={
              <IconButton
                icon="dots-vertical"
                size={20}
                onPress={() => toggleMenu(item.id!)}
              />
            }
          >
            <Menu.Item
              onPress={() => updateReservationStatus(item.id!, 'pending')}
              title="Marquer en attente"
              leadingIcon="clock-outline"
            />
            <Menu.Item
              onPress={() => updateReservationStatus(item.id!, 'on_water')}
              title="Marquer sur l'eau"
              leadingIcon="sail-boat"
            />
            <Menu.Item
              onPress={() => updateReservationStatus(item.id!, 'completed')}
              title="Marquer terminé"
              leadingIcon="check-circle"
            />
            <Menu.Item
              onPress={() => updateReservationStatus(item.id!, 'canceled')}
              title="Annuler"
              leadingIcon="close"
            />
          </Menu>
        </View>

        <View style={styles.reservationDetails}>
          <View style={styles.detailRow}>
            <Text variant="bodySmall" style={styles.detailLabel}>
              Personnes :
            </Text>
            <Text variant="bodyMedium" style={styles.detailValue}>
              {item.nb_people}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="bodySmall" style={styles.detailLabel}>
              Canoës :
            </Text>
            <Text variant="bodyMedium" style={styles.detailValue}>
              {item.single_canoes} simple(s), {item.double_canoes} double(s)
            </Text>
          </View>
        </View>

        <View style={styles.chipContainer}>
          <Chip
            mode="outlined"
            textStyle={{ color: statusColors[item.status] }}
            style={{ borderColor: statusColors[item.status] }}
          >
            {statusLabels[item.status]}
          </Chip>
          <Chip mode="outlined" textStyle={{ color: theme.colors.primary }}>
            {timeSlotLabels[item.timeslot]}
          </Chip>
        </View>
      </Card.Content>
    </Card>
  );

  const renderFilterChips = () => (
    <View style={styles.filterContainer}>
      {['all', 'pending', 'on_water', 'completed', 'canceled'].map((status) => (
        <Chip
          key={status}
          selected={statusFilter === status}
          onPress={() => handleStatusFilter(status)}
          style={[
            styles.filterChip,
            statusFilter === status && {
              backgroundColor: theme.colors.primary,
            },
          ]}
          textStyle={[statusFilter === status && { color: 'white' }]}
        >
          {status === 'all'
            ? 'Toutes'
            : statusLabels[status as keyof typeof statusLabels]}
        </Chip>
      ))}
    </View>
  );

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Rechercher par nom ou date..."
          onChangeText={handleSearch}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      {renderFilterChips()}

      <FlatList
        data={filteredReservations}
        renderItem={renderReservationItem}
        keyExtractor={(item) => item.id!.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
        getItemLayout={(data, index) => ({
          length: 150,
          offset: 150 * index,
          index,
        })}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              {searchQuery || statusFilter !== 'all'
                ? 'Aucune réservation ne correspond aux filtres'
                : 'Aucune réservation trouvée'}
            </Text>
          </View>
        )}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/add-reservation')}
        label="Réserver"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchbar: {
    backgroundColor: 'white',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    marginRight: 4,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  reservationCard: {
    marginBottom: 12,
    backgroundColor: 'white',
  },
  reservationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reservationInfo: {
    flex: 1,
  },
  customerName: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  reservationDate: {
    color: '#666',
  },
  durationText: {
    fontWeight: '600',
    fontSize: 12,
    marginTop: 4,
  },
  reservationDetails: {
    marginBottom: 12,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    color: '#666',
    minWidth: 60,
  },
  detailValue: {
    fontWeight: '500',
  },
  chipContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#1976D2',
  },
});
