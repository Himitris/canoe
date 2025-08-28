import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Card, Text, Chip, IconButton, FAB, Searchbar, useTheme, Menu } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { Reservation } from '../../services/DatabaseService';

const statusColors = {
  pending: '#FF9800',
  ongoing: '#2196F3',
  completed: '#4CAF50',
  canceled: '#F44336',
};

const statusLabels = {
  pending: 'Pending',
  ongoing: 'Ongoing',
  completed: 'Completed',
  canceled: 'Canceled',
};

const timeSlotLabels = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  full_day: 'Full Day',
};

export default function Reservations() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<Reservation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [menuVisible, setMenuVisible] = useState<{ [key: number]: boolean }>({});

  const loadReservations = async () => {
    if (!db) return;

    try {
      const data = await db.getReservations();
      setReservations(data);
      filterReservations(data, searchQuery, statusFilter);
    } catch (error) {
      console.error('Error loading reservations:', error);
    }
  };

  const filterReservations = (
    data: Reservation[],
    query: string,
    status: string
  ) => {
    let filtered = data;

    if (status !== 'all') {
      filtered = filtered.filter(r => r.status === status);
    }

    if (query.trim()) {
      const searchLower = query.toLowerCase();
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(searchLower) ||
        r.date.includes(query)
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

  const updateReservationStatus = async (id: number, status: Reservation['status']) => {
    if (!db) return;

    try {
      await db.updateReservation(id, { status });
      await loadReservations();
      setMenuVisible(prev => ({ ...prev, [id]: false }));
    } catch (error) {
      console.error('Error updating reservation status:', error);
    }
  };

  const toggleMenu = (id: number) => {
    setMenuVisible(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
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
              {format(new Date(item.date), 'MMM dd, yyyy')} • {item.arrival_time}
            </Text>
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
              title="Mark as Pending"
              leadingIcon="clock-outline"
            />
            <Menu.Item
              onPress={() => updateReservationStatus(item.id!, 'ongoing')}
              title="Mark as Ongoing"
              leadingIcon="play"
            />
            <Menu.Item
              onPress={() => updateReservationStatus(item.id!, 'completed')}
              title="Mark as Completed"
              leadingIcon="check"
            />
            <Menu.Item
              onPress={() => updateReservationStatus(item.id!, 'canceled')}
              title="Cancel"
              leadingIcon="close"
            />
          </Menu>
        </View>

        <View style={styles.reservationDetails}>
          <View style={styles.detailRow}>
            <Text variant="bodySmall" style={styles.detailLabel}>
              People:
            </Text>
            <Text variant="bodyMedium" style={styles.detailValue}>
              {item.nb_people}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text variant="bodySmall" style={styles.detailLabel}>
              Canoes:
            </Text>
            <Text variant="bodyMedium" style={styles.detailValue}>
              {item.single_canoes} single, {item.double_canoes} double
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
      {['all', 'pending', 'ongoing', 'completed', 'canceled'].map(status => (
        <Chip
          key={status}
          selected={statusFilter === status}
          onPress={() => handleStatusFilter(status)}
          style={[
            styles.filterChip,
            statusFilter === status && { backgroundColor: theme.colors.primary },
          ]}
          textStyle={[
            statusFilter === status && { color: 'white' },
          ]}
        >
          {status === 'all' ? 'All' : statusLabels[status as keyof typeof statusLabels]}
        </Chip>
      ))}
    </View>
  );

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search by name or date..."
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
                ? 'No reservations match your filters'
                : 'No reservations found'}
            </Text>
          </View>
        )}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/add-reservation')}
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