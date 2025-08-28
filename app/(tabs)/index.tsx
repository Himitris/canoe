import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import {
  Card,
  Title,
  Text,
  Chip,
  FAB,
  useTheme,
  Searchbar,
  Button,
  Avatar,
  IconButton,
  ProgressBar,
  Divider,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { format, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { SwipeableReservationCard } from '../../components/ui/SwipeableReservationCard';
import { Reservation } from '../../services/DatabaseService';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface AvailabilityData {
  morning: {
    single: number;
    double: number;
    total_single: number;
    total_double: number;
  };
  afternoon: {
    single: number;
    double: number;
    total_single: number;
    total_double: number;
  };
  full_day: {
    single: number;
    double: number;
    total_single: number;
    total_double: number;
  };
}

const { width } = Dimensions.get('window');

export default function Dashboard() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const [availability, setAvailability] = useState<AvailabilityData | null>(
    null
  );
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<
    Reservation[]
  >([]);
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAllReservations, setShowAllReservations] = useState(false);

  const loadData = async () => {
    if (!db) return;

    try {
      const [availabilityData, reservationsData] = await Promise.all([
        db.getAvailability(selectedDate),
        db.getReservations(selectedDate),
      ]);

      setAvailability(availabilityData);
      setReservations(reservationsData);
      filterReservations(reservationsData, searchQuery, selectedStatus);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
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
      filtered = filtered.filter((r) =>
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

  const handleStatusChange = async (
    id: number,
    status: Reservation['status']
  ) => {
    if (!db) return;

    try {
      await db.updateReservation(id, { status });
      await loadData();
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
    }
  };

  const handleDuplicate = async (id: number) => {
    if (!db) return;

    try {
      await db.duplicateReservation(id);
      await loadData();
    } catch (error) {
      console.error('Erreur lors de la duplication:', error);
    }
  };

  const getDateChips = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(new Date(), i);
      dates.push({
        label:
          i === 0
            ? "Aujourd'hui"
            : i === 1
            ? 'Demain'
            : format(date, 'dd MMM', { locale: fr }),
        value: format(date, 'yyyy-MM-dd'),
        date: date,
      });
    }
    return dates;
  };

  const getStatusCounts = () => {
    return {
      pending: reservations.filter((r) => r.status === 'pending').length,
      ongoing: reservations.filter((r) => r.status === 'ongoing').length,
      completed: reservations.filter((r) => r.status === 'completed').length,
      canceled: reservations.filter((r) => r.status === 'canceled').length,
    };
  };

  const getOccupancyColor = (used: number, total: number) => {
    if (total === 0) return theme.colors.outline;
    const percentage = used / total;
    if (percentage >= 0.9) return theme.colors.error;
    if (percentage >= 0.7) return '#FF9800';
    return '#4CAF50'; // Use a green color for success
  };

  const renderCompactAvailability = () => {
    if (!availability) return null;

    const slots = [
      {
        key: 'morning',
        label: 'Matin',
        icon: 'weather-sunny',
        data: availability.morning,
      },
      {
        key: 'afternoon',
        label: 'Après-midi',
        icon: 'weather-sunset',
        data: availability.afternoon,
      },
      {
        key: 'full_day',
        label: 'Journée',
        icon: 'clock-outline',
        data: availability.full_day,
      },
    ];

    return (
      <View style={styles.compactAvailability}>
        {slots.map((slot) => {
          const singleUsed = slot.data.total_single - slot.data.single;
          const doubleUsed = slot.data.total_double - slot.data.double;
          const totalUsed = singleUsed + doubleUsed;
          const totalCanoes = slot.data.total_single + slot.data.total_double;
          const progress = totalCanoes > 0 ? totalUsed / totalCanoes : 0;

          return (
            <View key={slot.key} style={styles.availabilitySlot}>
              <View style={styles.slotHeader}>
                <MaterialCommunityIcons
                  name={slot.icon as any}
                  size={16}
                  color={theme.colors.primary}
                />
                <Text variant="labelMedium" style={styles.slotLabel}>
                  {slot.label}
                </Text>
              </View>
              <ProgressBar
                progress={progress}
                color={getOccupancyColor(totalUsed, totalCanoes)}
                style={styles.progressBar}
              />
              <Text variant="labelSmall" style={styles.availabilityText}>
                {slot.data.single + slot.data.double}/{totalCanoes}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderCompactReservation = (
    reservation: Reservation,
    index: number
  ) => (
    <Card key={reservation.id} style={styles.compactCard} mode="outlined">
      <Card.Content style={styles.compactContent}>
        <View style={styles.reservationHeader}>
          <Avatar.Text
            size={32}
            label={reservation.name.charAt(0).toUpperCase()}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            labelStyle={{ fontSize: 14, color: theme.colors.primary }}
          />
          <View style={styles.reservationInfo}>
            <Text
              variant="bodyMedium"
              style={styles.customerName}
              numberOfLines={1}
            >
              {reservation.name}
            </Text>
            <Text variant="labelSmall" style={styles.reservationDetails}>
              {reservation.nb_people}p • {reservation.single_canoes}S+
              {reservation.double_canoes}D • {reservation.arrival_time}
            </Text>
          </View>
          <View style={styles.reservationActions}>
            <Chip
              mode="outlined"
              compact
              style={[
                styles.statusChip,
                {
                  backgroundColor: getStatusColor(reservation.status),
                  borderColor: getStatusColor(reservation.status),
                },
              ]}
              textStyle={styles.statusChipText}
            >
              {getStatusLabel(reservation.status)}
            </Chip>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  const getStatusColor = (status: string) => {
    const colors = {
      pending: '#FF9800',
      ongoing: '#2196F3',
      completed: '#4CAF50',
      canceled: '#F44336',
    };
    return colors[status as keyof typeof colors] || theme.colors.outline;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: 'Attente',
      ongoing: 'En cours',
      completed: 'Terminé',
      canceled: 'Annulé',
    };
    return labels[status as keyof typeof labels] || status;
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  const statusCounts = getStatusCounts();
  const displayedReservations = showAllReservations
    ? filteredReservations
    : filteredReservations.slice(0, 5);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* En-tête sophistiqué */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View>
              <Title style={styles.headerTitle}>Tableau de Bord</Title>
              <Text variant="bodyMedium" style={styles.headerSubtitle}>
                {format(new Date(), 'EEEE dd MMMM yyyy', { locale: fr })}
              </Text>
            </View>
            <IconButton
              icon="plus-circle"
              size={32}
              iconColor="white"
              style={styles.quickAddButton}
              onPress={() => router.push('/add-reservation')}
            />
          </View>
        </View>

        {/* Métriques rapides */}
        <View style={styles.metricsRow}>
          <Card
            style={[styles.metricCard, { backgroundColor: '#E3F2FD' }]}
            mode="elevated"
          >
            <Card.Content style={styles.metricContent}>
              <MaterialCommunityIcons
                name="calendar-today"
                size={24}
                color="#1976D2"
              />
              <Text
                variant="headlineSmall"
                style={[styles.metricNumber, { color: '#1976D2' }]}
              >
                {reservations.length}
              </Text>
              <Text variant="labelMedium" style={styles.metricLabel}>
                Réservations
              </Text>
            </Card.Content>
          </Card>

          <Card
            style={[styles.metricCard, { backgroundColor: '#E8F5E8' }]}
            mode="elevated"
          >
            <Card.Content style={styles.metricContent}>
              <MaterialCommunityIcons
                name="account-group"
                size={24}
                color="#388E3C"
              />
              <Text
                variant="headlineSmall"
                style={[styles.metricNumber, { color: '#388E3C' }]}
              >
                {reservations.reduce((sum, r) => sum + r.nb_people, 0)}
              </Text>
              <Text variant="labelMedium" style={styles.metricLabel}>
                Personnes
              </Text>
            </Card.Content>
          </Card>

          <Card
            style={[styles.metricCard, { backgroundColor: '#FFF3E0' }]}
            mode="elevated"
          >
            <Card.Content style={styles.metricContent}>
              <MaterialCommunityIcons
                name="kayaking"
                size={24}
                color="#F57C00"
              />
              <Text
                variant="headlineSmall"
                style={[styles.metricNumber, { color: '#F57C00' }]}
              >
                {statusCounts.ongoing}
              </Text>
              <Text variant="labelMedium" style={styles.metricLabel}>
                En cours
              </Text>
            </Card.Content>
          </Card>
        </View>

        {/* Disponibilité compacte */}
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="chart-donut"
                size={20}
                color={theme.colors.primary}
              />
              <Text variant="titleMedium" style={styles.cardTitle}>
                Disponibilité en Temps Réel
              </Text>
              <Button
                mode="text"
                compact
                onPress={() => router.push('/statistics')}
              >
                Détails
              </Button>
            </View>
            {renderCompactAvailability()}
          </Card.Content>
        </Card>

        {/* Sélecteur de date */}
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

        {/* Barre de recherche */}
        <View style={styles.searchContainer}>
          <Searchbar
            placeholder="Rechercher par nom de client..."
            onChangeText={handleSearch}
            value={searchQuery}
            style={styles.searchbar}
            icon="account-search"
          />
        </View>

        {/* Filtres de statut */}
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
            Toutes ({reservations.length})
          </Chip>

          <Chip
            selected={selectedStatus === 'pending'}
            onPress={() => handleStatusFilter('pending')}
            style={[
              styles.statusChip,
              selectedStatus === 'pending' && { backgroundColor: '#FF9800' },
            ]}
            textStyle={[selectedStatus === 'pending' && { color: 'white' }]}
          >
            Attente ({statusCounts.pending})
          </Chip>

          <Chip
            selected={selectedStatus === 'ongoing'}
            onPress={() => handleStatusFilter('ongoing')}
            style={[
              styles.statusChip,
              selectedStatus === 'ongoing' && { backgroundColor: '#2196F3' },
            ]}
            textStyle={[selectedStatus === 'ongoing' && { color: 'white' }]}
          >
            En cours ({statusCounts.ongoing})
          </Chip>

          <Chip
            selected={selectedStatus === 'completed'}
            onPress={() => handleStatusFilter('completed')}
            style={[
              styles.statusChip,
              selectedStatus === 'completed' && { backgroundColor: '#4CAF50' },
            ]}
            textStyle={[selectedStatus === 'completed' && { color: 'white' }]}
          >
            Terminées ({statusCounts.completed})
          </Chip>
        </ScrollView>

        {/* Liste des réservations */}
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="calendar-multiple"
                size={20}
                color={theme.colors.primary}
              />
              <Text variant="titleMedium" style={styles.cardTitle}>
                Réservations -{' '}
                {format(new Date(selectedDate), 'dd MMM', { locale: fr })}
              </Text>
              <Button
                mode="text"
                compact
                onPress={() => router.push('/reservations')}
              >
                Voir tout
              </Button>
            </View>

            {filteredReservations.length === 0 ? (
              <View style={styles.emptyContent}>
                <MaterialCommunityIcons
                  name="calendar-blank"
                  size={48}
                  color={theme.colors.outline}
                />
                <Text variant="bodyLarge" style={styles.emptyText}>
                  {searchQuery || selectedStatus !== 'all'
                    ? 'Aucune réservation ne correspond aux filtres'
                    : 'Aucune réservation pour cette date'}
                </Text>
              </View>
            ) : (
              <View style={styles.reservationsList}>
                {displayedReservations.map((reservation, index) =>
                  renderCompactReservation(reservation, index)
                )}

                {filteredReservations.length > 5 && !showAllReservations && (
                  <Button
                    mode="outlined"
                    onPress={() => setShowAllReservations(true)}
                    style={styles.showMoreButton}
                  >
                    Voir {filteredReservations.length - 5} de plus
                  </Button>
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Actions rapides */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Actions Rapides
            </Text>
            <View style={styles.quickActions}>
              <Button
                mode="contained"
                icon="plus"
                onPress={() => router.push('/add-reservation')}
                style={styles.actionButton}
              >
                Nouvelle Réservation
              </Button>
              <Button
                mode="outlined"
                icon="chart-line"
                onPress={() => router.push('/statistics')}
                style={styles.actionButton}
              >
                Statistiques
              </Button>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

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
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    backgroundColor: '#1976D2',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  quickAddButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  metricsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -10,
    marginBottom: 16,
    gap: 12,
  },
  metricCard: {
    flex: 1,
  },
  metricContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  metricNumber: {
    fontWeight: 'bold',
    marginTop: 4,
  },
  metricLabel: {
    color: '#666',
    marginTop: 2,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'white',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  cardTitle: {
    fontWeight: '600',
    color: '#1976D2',
    flex: 1,
  },
  compactAvailability: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  availabilitySlot: {
    flex: 1,
    alignItems: 'center',
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchbar: {
    backgroundColor: 'white',
  },
  dateChipsContainer: {
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
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
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
  reservationsList: {
    gap: 8,
  },
  compactCard: {
    backgroundColor: 'white',
  },
  compactContent: {
    paddingVertical: 12,
  },
  reservationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reservationInfo: {
    flex: 1,
  },
  customerName: {
    fontWeight: '600',
    marginBottom: 2,
  },
  reservationDetails: {
    color: '#666',
  },
  reservationActions: {
    alignItems: 'center',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'white',
  },
  showMoreButton: {
    marginTop: 12,
    borderColor: '#1976D2',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#1976D2',
  },
});
