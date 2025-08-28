import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { 
  Card, 
  Title, 
  Text, 
  Chip, 
  FAB, 
  useTheme, 
  Searchbar,
  Button 
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { format, addDays } from 'date-fns';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { AvailabilityWidget } from '../../components/ui/AvailabilityWidget';
import { SwipeableReservationCard } from '../../components/ui/SwipeableReservationCard';
import { Reservation } from '../../services/DatabaseService';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface AvailabilityData {
  morning: { single: number; double: number; total_single: number; total_double: number };
  afternoon: { single: number; double: number; total_single: number; total_double: number };
  full_day: { single: number; double: number; total_single: number; total_double: number };
}

export default function Dashboard() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<Reservation[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    if (!db) return;

    try {
      const [availabilityData, reservationsData] = await Promise.all([
        db.getAvailability(selectedDate),
        db.getReservations(selectedDate)
      ]);
      
      setAvailability(availabilityData);
      setReservations(reservationsData);
      filterReservations(reservationsData, searchQuery, selectedStatus);
    } catch (error) {
      console.error('Error loading data:', error);
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
        r.name.toLowerCase().includes(searchLower)
      );
    }

    setFilteredReservations(filtered);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [selectedDate, db]);

  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadData();
      }
    }, [selectedDate, isReady, db])
  );

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    filterReservations(reservations, query, selectedStatus);
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status);
    filterReservations(reservations, searchQuery, status);
  };

  const handleStatusChange = async (id: number, status: Reservation['status']) => {
    if (!db) return;

    try {
      await db.updateReservation(id, { status });
      await loadData();
    } catch (error) {
      console.error('Error updating reservation status:', error);
    }
  };

  const handleDuplicate = async (id: number) => {
    if (!db) return;

    try {
      await db.duplicateReservation(id);
      await loadData();
    } catch (error) {
      console.error('Error duplicating reservation:', error);
    }
  };

  const getDateChips = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(new Date(), i);
      dates.push({
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'MMM dd'),
        value: format(date, 'yyyy-MM-dd'),
        date: date,
      });
    }
    return dates;
  };

  const getStatusCounts = () => {
    return {
      pending: reservations.filter(r => r.status === 'pending').length,
      ongoing: reservations.filter(r => r.status === 'ongoing').length,
      completed: reservations.filter(r => r.status === 'completed').length,
      canceled: reservations.filter(r => r.status === 'canceled').length,
    };
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const statusCounts = getStatusCounts();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Title style={styles.headerTitle}>Canoe Rentals</Title>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>
            Dashboard & Live Availability
          </Text>
        </View>

        <AvailabilityWidget availability={availability} selectedDate={selectedDate} />

        <Card style={styles.quickStatsCard} mode="elevated">
          <Card.Content>
            <View style={styles.quickStatsHeader}>
              <MaterialCommunityIcons
                name="chart-line"
                size={20}
                color={theme.colors.primary}
              />
              <Text variant="titleMedium" style={styles.quickStatsTitle}>
                Today's Overview
              </Text>
              <Button
                mode="text"
                compact
                onPress={() => router.push('/statistics')}
                style={styles.viewAllButton}
              >
                View All
              </Button>
            </View>
            
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statNumber}>
                  {reservations.length}
                </Text>
                <Text variant="labelMedium" style={styles.statLabel}>
                  Total Reservations
                </Text>
              </View>
              
              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statNumber}>
                  {reservations.reduce((sum, r) => sum + r.nb_people, 0)}
                </Text>
                <Text variant="labelMedium" style={styles.statLabel}>
                  Total People
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.searchContainer}>
          <Searchbar
            placeholder="Search by client name..."
            onChangeText={handleSearch}
            value={searchQuery}
            style={styles.searchbar}
            icon="account-search"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateChipsContainer}
        >
          {getDateChips().map((dateItem) => (
            <Chip
              key={dateItem.value}
              selected={selectedDate === dateItem.value}
              onPress={() => setSelectedDate(dateItem.value)}
              style={[
                styles.dateChip,
                selectedDate === dateItem.value && styles.selectedDateChip,
              ]}
              textStyle={[
                styles.dateChipText,
                selectedDate === dateItem.value && styles.selectedDateChipText,
              ]}
            >
              {dateItem.label}
            </Chip>
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusChipsContainer}
        >
          <Chip
            selected={selectedStatus === 'all'}
            onPress={() => handleStatusFilter('all')}
            style={[
              styles.statusChip,
              selectedStatus === 'all' && styles.selectedStatusChip,
            ]}
            textStyle={[
              selectedStatus === 'all' && styles.selectedStatusChipText,
            ]}
          >
            All ({reservations.length})
          </Chip>
          
          <Chip
            selected={selectedStatus === 'pending'}
            onPress={() => handleStatusFilter('pending')}
            style={[
              styles.statusChip,
              selectedStatus === 'pending' && { backgroundColor: '#FF9800' },
            ]}
            textStyle={[
              selectedStatus === 'pending' && { color: 'white' },
            ]}
          >
            Pending ({statusCounts.pending})
          </Chip>
          
          <Chip
            selected={selectedStatus === 'ongoing'}
            onPress={() => handleStatusFilter('ongoing')}
            style={[
              styles.statusChip,
              selectedStatus === 'ongoing' && { backgroundColor: '#2196F3' },
            ]}
            textStyle={[
              selectedStatus === 'ongoing' && { color: 'white' },
            ]}
          >
            Ongoing ({statusCounts.ongoing})
          </Chip>
          
          <Chip
            selected={selectedStatus === 'completed'}
            onPress={() => handleStatusFilter('completed')}
            style={[
              styles.statusChip,
              selectedStatus === 'completed' && { backgroundColor: '#4CAF50' },
            ]}
            textStyle={[
              selectedStatus === 'completed' && { color: 'white' },
            ]}
          >
            Completed ({statusCounts.completed})
          </Chip>
        </ScrollView>

        <View style={styles.reservationsSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Reservations for {format(new Date(selectedDate), 'MMM dd, yyyy')}
          </Text>
          
          {filteredReservations.length === 0 ? (
            <Card style={styles.emptyCard} mode="outlined">
              <Card.Content>
                <View style={styles.emptyContent}>
                  <MaterialCommunityIcons
                    name="calendar-blank"
                    size={48}
                    color={theme.colors.outline}
                  />
                  <Text variant="bodyLarge" style={styles.emptyText}>
                    {searchQuery || selectedStatus !== 'all'
                      ? 'No reservations match your filters'
                      : 'No reservations for this date'}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          ) : (
            filteredReservations.map((reservation) => (
              <SwipeableReservationCard
                key={reservation.id}
                reservation={reservation}
                onStatusChange={handleStatusChange}
                onDuplicate={handleDuplicate}
              />
            ))
          )}
        </View>
      </ScrollView>

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
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  headerSubtitle: {
    color: '#666',
    marginTop: 4,
  },
  quickStatsCard: {
    backgroundColor: 'white',
    marginBottom: 16,
  },
  quickStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  quickStatsTitle: {
    flex: 1,
    fontWeight: '600',
    color: '#1976D2',
  },
  viewAllButton: {
    marginRight: -8,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontWeight: 'bold',
    color: '#1976D2',
  },
  statLabel: {
    color: '#666',
    marginTop: 4,
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchbar: {
    backgroundColor: 'white',
  },
  dateChipsContainer: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 8,
  },
  dateChip: {
    marginHorizontal: 4,
  },
  selectedDateChip: {
    backgroundColor: '#1976D2',
  },
  dateChipText: {
    fontSize: 12,
  },
  selectedDateChipText: {
    color: 'white',
  },
  statusChipsContainer: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 16,
  },
  statusChip: {
    marginHorizontal: 4,
  },
  selectedStatusChip: {
    backgroundColor: '#1976D2',
  },
  selectedStatusChipText: {
    color: 'white',
  },
  reservationsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
    color: '#1976D2',
  },
  emptyCard: {
    backgroundColor: 'white',
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
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