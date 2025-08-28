import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Dimensions,
  FlatList,
} from 'react-native';
import {
  Card,
  Title,
  Text,
  Chip,
  FAB,
  useTheme,
  Button,
  Avatar,
  IconButton,
  ProgressBar,
  TouchableRipple,
  Searchbar,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { format, addDays, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDatabase } from '../../components/database/DatabaseProvider';
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

interface ReservationWithStatus extends Reservation {
  isLate?: boolean;
  lateMinutes?: number;
}

const { width } = Dimensions.get('window');

export default function Dashboard() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const [availability, setAvailability] = useState<AvailabilityData | null>(
    null
  );
  const [reservations, setReservations] = useState<ReservationWithStatus[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<
    ReservationWithStatus[]
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

      // Ajouter les informations de retard
      const reservationsWithStatus = reservationsData.map((reservation) => {
        const now = new Date();
        const expectedTime = new Date(
          `${reservation.date}T${reservation.arrival_time}:00`
        );
        const isLate = reservation.status === 'pending' && now > expectedTime;
        const lateMinutes = isLate
          ? Math.floor((now.getTime() - expectedTime.getTime()) / (1000 * 60))
          : 0;

        return { ...reservation, isLate, lateMinutes } as ReservationWithStatus;
      });

      setReservations(reservationsWithStatus);
      filterReservations(reservationsWithStatus, selectedStatus, searchQuery);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    }
  };

  const filterReservations = (
    data: ReservationWithStatus[],
    status: string,
    search: string
  ) => {
    let filtered = data;

    if (status !== 'all') {
      if (status === 'late') {
        filtered = filtered.filter((r) => r.isLate);
      } else {
        filtered = filtered.filter((r) => r.status === status);
      }
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.name.toLowerCase().includes(searchLower)
      );
    }

    // Tri : retards en premier, puis par heure
    filtered.sort((a, b) => {
      if (a.isLate && !b.isLate) return -1;
      if (!a.isLate && b.isLate) return 1;
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return a.arrival_time.localeCompare(b.arrival_time);
    });

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

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status);
    filterReservations(reservations, status, searchQuery);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    filterReservations(reservations, selectedStatus, query);
  };

  const handleStatusChange = async (
    id: number,
    status: Reservation['status']
  ) => {
    if (!db) return;

    try {
      if (status === 'on_water') {
        await db.markReservationOnWater(id);
      } else if (status === 'completed') {
        await db.markReservationCompleted(id);
      } else {
        await db.updateReservation(id, { status });
      }
      await loadData();
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
    }
  };

  // Navigation par dates avec swipe
  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    const newDate =
      direction === 'next' ? addDays(currentDate, 1) : subDays(currentDate, 1);
    setSelectedDate(format(newDate, 'yyyy-MM-dd'));
  };

  const getStatusCounts = () => {
    return {
      pending: reservations.filter((r) => r.status === 'pending').length,
      arrived: reservations.filter(
        (r) => r.status === 'pending' && r.actual_arrival_time
      ).length,
      on_water: reservations.filter((r) => r.status === 'on_water').length,
      completed: reservations.filter((r) => r.status === 'completed').length,
      late: reservations.filter((r) => r.isLate).length,
    };
  };

  const getOccupancyColor = (used: number, total: number) => {
    if (total === 0) return theme.colors.outline;
    const percentage = used / total;
    if (percentage >= 0.9) return theme.colors.error;
    if (percentage >= 0.7) return '#FF9800';
    return '#4CAF50';
  };

  // Rendu séparé pour les canoës simples et doubles
  const renderAvailabilitySlot = (
    title: string,
    icon: string,
    data: {
      single: number;
      double: number;
      total_single: number;
      total_double: number;
    }
  ) => {
    const singleUsed = data.total_single - data.single;
    const doubleUsed = data.total_double - data.double;

    return (
      <View key={title} style={styles.availabilitySlot}>
        <View style={styles.slotHeader}>
          <MaterialCommunityIcons
            name={icon as any}
            size={16}
            color={theme.colors.primary}
          />
          <Text variant="labelMedium" style={styles.slotLabel}>
            {title}
          </Text>
        </View>

        {/* Canoës simples */}
        <View style={styles.canoeTypeRow}>
          <Text variant="labelSmall" style={styles.canoeTypeLabel}>
            Simples
          </Text>
          <ProgressBar
            progress={
              data.total_single > 0 ? singleUsed / data.total_single : 0
            }
            color={getOccupancyColor(singleUsed, data.total_single)}
            style={styles.progressBar}
          />
          <Text variant="labelSmall" style={styles.availabilityText}>
            {data.single}/{data.total_single}
          </Text>
        </View>

        {/* Canoës doubles */}
        <View style={styles.canoeTypeRow}>
          <Text variant="labelSmall" style={styles.canoeTypeLabel}>
            Doubles
          </Text>
          <ProgressBar
            progress={
              data.total_double > 0 ? doubleUsed / data.total_double : 0
            }
            color={getOccupancyColor(doubleUsed, data.total_double)}
            style={styles.progressBar}
          />
          <Text variant="labelSmall" style={styles.availabilityText}>
            {data.double}/{data.total_double}
          </Text>
        </View>
      </View>
    );
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
        {slots.map((slot) =>
          renderAvailabilitySlot(slot.label, slot.icon, slot.data)
        )}
      </View>
    );
  };

  const renderReservationItem = ({
    item,
    index,
  }: {
    item: ReservationWithStatus;
    index: number;
  }) => {
    const getStatusInfo = () => {
      if (item.isLate) {
        return {
          color: '#D32F2F',
          bgColor: '#FFCDD2',
          icon: 'alert-circle',
          text: `RETARD ${item.lateMinutes}min`,
          textColor: '#D32F2F',
        };
      }

      switch (item.status) {
        case 'pending':
          return {
            color: '#F57C00',
            bgColor: '#FFE0B2',
            icon: 'clock-outline',
            text: 'EN ATTENTE',
            textColor: '#E65100',
          };
        case 'on_water':
          return {
            color: '#388E3C',
            bgColor: '#C8E6C9',
            icon: 'sail-boat',
            text: "SUR L'EAU",
            textColor: '#2E7D32',
          };
        case 'completed':
          return {
            color: '#616161',
            bgColor: '#E0E0E0',
            icon: 'check-circle',
            text: 'TERMINÉ',
            textColor: '#424242',
          };
        default:
          return {
            color: '#757575',
            bgColor: '#F5F5F5',
            icon: 'help-circle',
            text: 'INCONNU',
            textColor: '#616161',
          };
      }
    };

    const statusInfo = getStatusInfo();
    const isEven = index % 2 === 0;

    return (
      <TouchableRipple
        key={item.id}
        onPress={() => {}}
        style={[
          styles.reservationRow,
          { backgroundColor: isEven ? '#FAFAFA' : 'white' },
        ]}
      >
        <View style={styles.reservationContent}>
          {/* Indicateur coloré */}
          <View
            style={[styles.statusBar, { backgroundColor: statusInfo.color }]}
          />

          {/* Info client */}
          <View style={styles.clientSection}>
            <Text style={styles.clientName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.timeText}>{item.arrival_time}</Text>
          </View>

          {/* Détails */}
          <View style={styles.detailsSection}>
            <Text style={styles.peopleText}>{item.nb_people}p</Text>
            <Text style={styles.canoeText}>
              {item.single_canoes}S+{item.double_canoes}D
            </Text>
            <Text style={styles.slotText}>
              {item.timeslot === 'morning'
                ? 'MAT'
                : item.timeslot === 'afternoon'
                ? 'APM'
                : 'J'}
            </Text>
          </View>

          {/* Statut */}
          <View style={styles.statusSection}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusInfo.bgColor },
              ]}
            >
              <MaterialCommunityIcons
                name={statusInfo.icon as any}
                size={14}
                color={statusInfo.textColor}
              />
              <Text
                style={[styles.statusText, { color: statusInfo.textColor }]}
              >
                {statusInfo.text}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionSection}>
            {item.status === 'pending' && (
              <TouchableRipple
                onPress={() => handleStatusChange(item.id!, 'on_water')}
                style={[styles.actionButton, { backgroundColor: '#388E3C' }]}
              >
                <MaterialCommunityIcons
                  name="sail-boat"
                  size={18}
                  color="white"
                />
              </TouchableRipple>
            )}

            {item.status === 'on_water' && (
              <TouchableRipple
                onPress={() => handleStatusChange(item.id!, 'completed')}
                style={[styles.actionButton, { backgroundColor: '#616161' }]}
              >
                <MaterialCommunityIcons
                  name="check-circle"
                  size={18}
                  color="white"
                />
              </TouchableRipple>
            )}
          </View>
        </View>
      </TouchableRipple>
    );
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
    : filteredReservations.slice(0, 10);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* En-tête avec navigation de date */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <IconButton
              icon="chevron-left"
              size={24}
              iconColor="white"
              onPress={() => navigateDate('prev')}
            />
            <View style={styles.headerTextContainer}>
              <Title style={styles.headerTitle}>Tableau de Bord</Title>
              <Text variant="bodyMedium" style={styles.headerSubtitle}>
                {format(new Date(selectedDate), 'EEEE dd MMMM yyyy', {
                  locale: fr,
                })}
              </Text>
            </View>
            <IconButton
              icon="chevron-right"
              size={24}
              iconColor="white"
              onPress={() => navigateDate('next')}
            />
          </View>
        </View>

        {/* Métriques corrigées */}
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
            style={[styles.metricCard, { backgroundColor: '#FFF3E0' }]}
            mode="elevated"
          >
            <Card.Content style={styles.metricContent}>
              <MaterialCommunityIcons
                name="account-check"
                size={24}
                color="#FF9800"
              />
              <Text
                variant="headlineSmall"
                style={[styles.metricNumber, { color: '#FF9800' }]}
              >
                {statusCounts.arrived}
              </Text>
              <Text variant="labelMedium" style={styles.metricLabel}>
                Arrivés
              </Text>
            </Card.Content>
          </Card>

          <Card
            style={[styles.metricCard, { backgroundColor: '#E8F5E8' }]}
            mode="elevated"
          >
            <Card.Content style={styles.metricContent}>
              <MaterialCommunityIcons
                name="sail-boat"
                size={24}
                color="#4CAF50"
              />
              <Text
                variant="headlineSmall"
                style={[styles.metricNumber, { color: '#4CAF50' }]}
              >
                {statusCounts.on_water}
              </Text>
              <Text variant="labelMedium" style={styles.metricLabel}>
                Sur l'eau
              </Text>
            </Card.Content>
          </Card>
        </View>

        {/* Disponibilité améliorée */}
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
            </View>
            {renderCompactAvailability()}
          </Card.Content>
        </Card>

        {/* Barre de recherche */}
        <Searchbar
          placeholder="Rechercher un client..."
          onChangeText={handleSearch}
          value={searchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor="#1976D2"
        />

        {/* Filtres de statut */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusChipsContainer}
        >
          {[
            {
              key: 'all',
              label: 'TOUTES',
              count:
                statusCounts.pending +
                statusCounts.on_water +
                statusCounts.completed,
              color: '#1976D2',
            },
            {
              key: 'late',
              label: 'RETARDS',
              count: statusCounts.late,
              color: '#D32F2F',
            },
            {
              key: 'pending',
              label: 'ATTENTE',
              count: statusCounts.pending,
              color: '#F57C00',
            },
            {
              key: 'on_water',
              label: "SUR L'EAU",
              count: statusCounts.on_water,
              color: '#388E3C',
            },
            {
              key: 'completed',
              label: 'TERMINÉ',
              count: statusCounts.completed,
              color: '#616161',
            },
          ].map((filter) => (
            <Chip
              key={filter.key}
              selected={selectedStatus === filter.key}
              onPress={() => handleStatusFilter(filter.key)}
              compact
              style={[
                styles.filterChip,
                selectedStatus === filter.key && {
                  backgroundColor: filter.color,
                },
              ]}
              textStyle={[
                styles.filterChipText,
                selectedStatus === filter.key && { color: 'white' },
              ]}
            >
              {filter.label} ({filter.count})
            </Chip>
          ))}
        </ScrollView>

        {/* Liste des réservations unifiée */}
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
              <Text variant="labelSmall" style={styles.totalCount}>
                {filteredReservations.length} résultat(s)
              </Text>
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
              <FlatList
                data={displayedReservations}
                renderItem={renderReservationItem}
                keyExtractor={(item) => item.id!.toString()}
                style={styles.reservationsList}
                scrollEnabled={false}
                removeClippedSubviews={true}
                maxToRenderPerBatch={20}
                windowSize={10}
                initialNumToRender={10}
                getItemLayout={(data, index) => ({
                  length: 60,
                  offset: 60 * index,
                  index,
                })}
                ListFooterComponent={() =>
                  filteredReservations.length > 10 && !showAllReservations ? (
                    <Button
                      mode="outlined"
                      onPress={() => setShowAllReservations(true)}
                      style={styles.showMoreButton}
                    >
                      Voir {filteredReservations.length - 10} de plus
                    </Button>
                  ) : null
                }
              />
            )}
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
  headerTextContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
    textAlign: 'center',
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
    textAlign: 'center',
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
  totalCount: {
    color: '#666',
  },
  compactAvailability: {
    flexDirection: 'column',
    gap: 16,
  },
  availabilitySlot: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  slotLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
  },
  canoeTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  canoeTypeLabel: {
    minWidth: 50,
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  availabilityText: {
    minWidth: 35,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
  searchbar: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
  },
  searchInput: {
    fontSize: 14,
  },
  statusChipsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    backgroundColor: '#F8F9FA',
    height: 32,
    marginHorizontal: 2,
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#757575',
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
    maxHeight: 600,
  },
  reservationRow: {
    height: 60,
    marginVertical: 1,
  },
  reservationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 12,
  },
  statusBar: {
    width: 4,
    height: '80%',
    marginRight: 12,
    borderRadius: 2,
  },
  clientSection: {
    flex: 2,
    minWidth: 100,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 2,
  },
  timeText: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '600',
  },
  detailsSection: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  peopleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1976D2',
    minWidth: 20,
  },
  canoeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    minWidth: 35,
  },
  slotText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9E9E9E',
    minWidth: 25,
  },
  statusSection: {
    flex: 2,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  actionSection: {
    flex: 1,
    alignItems: 'center',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  showMoreButton: {
    marginTop: 12,
    borderColor: '#1976D2',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#1976D2',
  },
});
