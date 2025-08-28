import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Surface,
  IconButton,
  Searchbar,
  useTheme,
  Menu,
  Divider,
  Button,
  Chip,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  format,
  addDays,
  subDays,
  parseISO,
  differenceInMinutes,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { Reservation } from '../../services/DatabaseService';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface ReservationWithStatus extends Reservation {
  isLate?: boolean;
  lateMinutes?: number;
  timeAlert?: {
    type: 'early_afternoon' | 'overtime_morning' | 'wrong_timeslot';
    message: string;
    severity: 'warning' | 'error';
  };
}

const { width } = Dimensions.get('window');

export default function ReservationsManager() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const [allReservations, setAllReservations] = useState<
    ReservationWithStatus[]
  >([]);
  const [filteredReservations, setFilteredReservations] = useState<
    ReservationWithStatus[]
  >([]);
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState<{ [key: number]: boolean }>(
    {}
  );
  const [selectedStatus, setSelectedStatus] = useState('all');

  const loadReservations = async () => {
    if (!db) return;

    try {
      // Utiliser la nouvelle méthode qui inclut les alertes temporelles
      const reservationsData = await db.getReservationsWithTimeAlerts(
        selectedDate
      );

      setAllReservations(reservationsData);
      // Appliquer les filtres après avoir chargé toutes les réservations
      applyFilters(reservationsData, searchQuery, selectedStatus);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    }
  };

  const applyFilters = (
    data: ReservationWithStatus[],
    search: string,
    status: string
  ) => {
    let filtered = [...data];

    // Filtrer par recherche
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.name.toLowerCase().includes(searchLower)
      );
    }

    // Filtrer par statut
    if (status !== 'all') {
      if (status === 'late') {
        filtered = filtered.filter((r) => r.isLate);
      } else {
        filtered = filtered.filter((r) => r.status === status);
      }
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
    await loadReservations();
    setRefreshing(false);
  }, [selectedDate, db]);

  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadReservations();
      }
    }, [selectedDate, isReady, db])
  );

  // Appliquer les filtres quand la recherche ou le statut change
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    applyFilters(allReservations, query, selectedStatus);
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status);
    applyFilters(allReservations, searchQuery, status);
  };

  // Navigation par dates
  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    const newDate =
      direction === 'next' ? addDays(currentDate, 1) : subDays(currentDate, 1);
    setSelectedDate(format(newDate, 'yyyy-MM-dd'));
  };

  const handleStatusChange = async (
    id: number,
    newStatus: Reservation['status']
  ) => {
    if (!db) return;

    try {
      if (newStatus === 'on_water') {
        await db.markReservationOnWater(id);
      } else if (newStatus === 'completed') {
        await db.markReservationCompleted(id);
      } else {
        await db.updateReservation(id, { status: newStatus });
      }
      await loadReservations();
      setMenuVisible((prev) => ({ ...prev, [id]: false }));
    } catch (error) {
      console.error('Erreur lors du changement de statut:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
    }
  };

  // Actions rapides (un clic pour passer à l'étape suivante)
  const handleQuickAction = async (reservation: ReservationWithStatus) => {
    if (!db) return;

    switch (reservation.status) {
      case 'pending':
        await handleStatusChange(reservation.id!, 'on_water');
        break;
      case 'on_water':
        await handleStatusChange(reservation.id!, 'completed');
        break;
      case 'completed':
        // Déjà terminé, pas d'action rapide
        break;
      case 'canceled':
        // Annulé, pas d'action rapide
        break;
    }
  };

  const toggleMenu = (id: number) => {
    setMenuVisible((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getStatusInfo = (item: ReservationWithStatus) => {
    // Priorité aux alertes temporelles pour les réservations sur l'eau
    if (item.timeAlert && item.status === 'on_water') {
      const isError = item.timeAlert.severity === 'error';
      return {
        color: '#FFFFFF',
        bgColor: isError ? '#D32F2F' : '#FF6D00', // Rouge foncé pour erreur, orange foncé pour warning
        icon: isError ? 'alert-octagon' : 'clock-alert',
        text: isError ? 'ERREUR TEMPS' : 'ALERTE TEMPS',
        nextAction: 'check-circle',
        nextLabel: 'Terminer',
      };
    }

    // Retard classique (pour les réservations en attente)
    if (item.isLate) {
      return {
        color: '#FFFFFF',
        bgColor: '#D32F2F',
        icon: 'alert-circle',
        text: `RETARD ${item.lateMinutes}min`,
        nextAction: 'sail-boat',
        nextLabel: "Sur l'eau",
      };
    }

    // Statuts normaux
    switch (item.status) {
      case 'pending':
        return {
          color: '#FFFFFF',
          bgColor: '#FF9800',
          icon: 'clock-outline',
          text: 'ATTENTE',
          nextAction: 'sail-boat',
          nextLabel: "Sur l'eau",
        };
      case 'on_water':
        return {
          color: '#FFFFFF',
          bgColor: '#4CAF50',
          icon: 'sail-boat',
          text: "SUR L'EAU",
          nextAction: 'check-circle',
          nextLabel: 'Terminer',
        };
      case 'completed':
        return {
          color: '#FFFFFF',
          bgColor: '#757575',
          icon: 'check-circle',
          text: 'TERMINÉ',
          nextAction: null,
          nextLabel: null,
        };
      case 'canceled':
        return {
          color: '#FFFFFF',
          bgColor: '#F44336',
          icon: 'close-circle',
          text: 'ANNULÉ',
          nextAction: null,
          nextLabel: null,
        };
      default:
        return {
          color: '#FFFFFF',
          bgColor: '#757575',
          icon: 'help-circle',
          text: 'INCONNU',
          nextAction: null,
          nextLabel: null,
        };
    }
  };

  const renderHeaderRow = () => (
    <View style={styles.headerContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>RÉSERVATIONS</Text>
        <Text style={styles.headerSubtitle}>
          {filteredReservations.length} sur {allReservations.length}{' '}
          réservations
        </Text>
      </View>
    </View>
  );

  const renderReservationRow = ({
    item,
    index,
  }: {
    item: ReservationWithStatus;
    index: number;
  }) => {
    const statusInfo = getStatusInfo(item);
    const isEven = index % 2 === 0;

    return (
      <TouchableOpacity
        style={[
          styles.compactCard,
          { backgroundColor: isEven ? '#FAFAFA' : 'white' },
        ]}
        activeOpacity={0.7}
      >
        {/* Ligne 1: Nom + Heure + Statut principal */}
        <View style={styles.topRow}>
          <View style={styles.nameSection}>
            <Text style={styles.compactName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.compactTime}>{item.arrival_time}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.compactStatus,
              { backgroundColor: statusInfo.bgColor },
            ]}
            onPress={() => statusInfo.nextAction && handleQuickAction(item)}
            disabled={!statusInfo.nextAction}
          >
            <MaterialCommunityIcons
              name={statusInfo.icon as any}
              size={12}
              color={statusInfo.color}
            />
            <Text
              style={[styles.compactStatusText, { color: statusInfo.color }]}
            >
              {statusInfo.text}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Ligne 2: Détails compacts + Actions */}
        <View style={styles.bottomRow}>
          <View style={styles.compactDetails}>
            <Text style={styles.detailItem}>
              <MaterialCommunityIcons
                name="account"
                size={12}
                color="#1976D2"
              />{' '}
              {item.nb_people}p
            </Text>
            <Text style={styles.detailSeparator}>•</Text>
            <Text style={styles.detailItem}>
              {item.single_canoes}S+{item.double_canoes}D
            </Text>
            <Text style={styles.detailSeparator}>•</Text>
            <Text style={styles.detailItem}>
              {item.timeslot === 'morning'
                ? 'Mat'
                : item.timeslot === 'afternoon'
                ? 'Apr'
                : 'Jour'}
            </Text>
            {item.isLate && (
              <>
                <Text style={styles.detailSeparator}>•</Text>
                <Text style={styles.lateDetail}>
                  <MaterialCommunityIcons
                    name="alert"
                    size={12}
                    color="#D32F2F"
                  />{' '}
                  +{item.lateMinutes}min
                </Text>
              </>
            )}
            {item.timeAlert && (
              <>
                <Text style={styles.detailSeparator}>•</Text>
                <Text
                  style={[
                    styles.timeAlertDetail,
                    {
                      color:
                        item.timeAlert.severity === 'error'
                          ? '#D32F2F'
                          : '#FF6D00',
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      item.timeAlert.severity === 'error'
                        ? 'alert-octagon'
                        : 'clock-alert'
                    }
                    size={12}
                    color={
                      item.timeAlert.severity === 'error'
                        ? '#D32F2F'
                        : '#FF6D00'
                    }
                  />{' '}
                  {item.timeAlert.message}
                </Text>
              </>
            )}
          </View>

          <View style={styles.compactActions}>
            {/* Action rapide */}
            {statusInfo.nextAction && (
              <TouchableOpacity
                style={[
                  styles.compactActionBtn,
                  { backgroundColor: statusInfo.bgColor },
                ]}
                onPress={() => handleQuickAction(item)}
              >
                <MaterialCommunityIcons
                  name={statusInfo.nextAction as any}
                  size={16}
                  color="white"
                />
              </TouchableOpacity>
            )}

            {/* Menu compact */}
            <Menu
              visible={menuVisible[item.id!] || false}
              onDismiss={() => toggleMenu(item.id!)}
              anchor={
                <TouchableOpacity
                  style={styles.compactMenuBtn}
                  onPress={() => toggleMenu(item.id!)}
                >
                  <MaterialCommunityIcons
                    name="dots-vertical"
                    size={16}
                    color="#666"
                  />
                </TouchableOpacity>
              }
            >
              <Menu.Item
                onPress={() => handleStatusChange(item.id!, 'pending')}
                title="⏳ Remettre en attente"
                leadingIcon="clock-outline"
              />
              <Menu.Item
                onPress={() => handleStatusChange(item.id!, 'on_water')}
                title="⛵ Mettre sur l'eau"
                leadingIcon="sail-boat"
              />
              <Menu.Item
                onPress={() => handleStatusChange(item.id!, 'completed')}
                title="✅ Marquer terminé"
                leadingIcon="check-circle"
              />
              <Divider />
              <Menu.Item
                onPress={() => handleStatusChange(item.id!, 'canceled')}
                title="❌ Annuler"
                leadingIcon="close"
                titleStyle={{ color: '#F44336' }}
              />
            </Menu>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const getStatusCounts = () => {
    // Compter sur TOUTES les réservations du jour, pas seulement les filtrées
    return {
      all: allReservations.length,
      pending: allReservations.filter((r) => r.status === 'pending').length,
      on_water: allReservations.filter((r) => r.status === 'on_water').length,
      completed: allReservations.filter((r) => r.status === 'completed').length,
      late: allReservations.filter((r) => r.isLate).length,
    };
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  const statusCounts = getStatusCounts();

  return (
    <View style={styles.container}>
      {/* En-tête avec navigation de date */}
      <Surface style={styles.header} elevation={4}>
        <View style={styles.headerTop}>
          <IconButton
            icon="chevron-left"
            size={24}
            iconColor="#1976D2"
            onPress={() => navigateDate('prev')}
          />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>GESTION RÉSERVATIONS</Text>
            <Text style={styles.headerDate}>
              {format(new Date(selectedDate), 'EEEE dd MMMM yyyy', {
                locale: fr,
              }).toUpperCase()}
            </Text>
          </View>
          <IconButton
            icon="chevron-right"
            size={24}
            iconColor="#1976D2"
            onPress={() => navigateDate('next')}
          />
        </View>

        {/* Métriques rapides */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricNumber}>{statusCounts.all}</Text>
            <Text style={styles.metricLabel}>TOTAL</Text>
          </View>
          <Divider style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text
              style={[
                styles.metricNumber,
                { color: statusCounts.late > 0 ? '#D32F2F' : '#757575' },
              ]}
            >
              {statusCounts.late}
            </Text>
            <Text style={styles.metricLabel}>RETARDS</Text>
          </View>
          <Divider style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={[styles.metricNumber, { color: '#4CAF50' }]}>
              {statusCounts.on_water}
            </Text>
            <Text style={styles.metricLabel}>SUR L'EAU</Text>
          </View>
          <Divider style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={[styles.metricNumber, { color: '#FF9800' }]}>
              {statusCounts.pending}
            </Text>
            <Text style={styles.metricLabel}>ATTENTE</Text>
          </View>
        </View>
      </Surface>

      {/* Contrôles de recherche et filtres */}
      <View style={styles.controlsContainer}>
        <Searchbar
          placeholder="Rechercher un client..."
          onChangeText={handleSearch}
          value={searchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor="#1976D2"
        />

        <View style={styles.filtersRow}>
          {[
            {
              key: 'all',
              label: 'TOUTES',
              count: statusCounts.all,
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
              color: '#FF9800',
            },
            {
              key: 'on_water',
              label: "SUR L'EAU",
              count: statusCounts.on_water,
              color: '#4CAF50',
            },
            {
              key: 'completed',
              label: 'TERMINÉ',
              count: statusCounts.completed,
              color: '#757575',
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
        </View>
      </View>

      {/* Tableau style Excel */}
      <FlatList
        data={filteredReservations}
        ListHeaderComponent={renderHeaderRow}
        renderItem={renderReservationRow}
        keyExtractor={(item) => item.id!.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.table}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={25}
        windowSize={10}
        initialNumToRender={20}
        getItemLayout={(data, index) => ({
          length: 60, // Hauteur réduite pour plus d'efficacité
          offset: 60 * index,
          index,
        })}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="calendar-blank"
              size={64}
              color="#BDBDBD"
            />
            <Text style={styles.emptyTitle}>Aucune réservation</Text>
            <Text style={styles.emptyText}>
              {searchQuery || selectedStatus !== 'all'
                ? 'Aucune réservation correspondante'
                : "Aucune réservation aujourd'hui"}
            </Text>
          </View>
        )}
      />

      {/* Bouton flottant pour ajouter */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/add-reservation')}
      >
        <MaterialCommunityIcons name="plus" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1976D2',
    letterSpacing: 0.5,
  },
  headerDate: {
    fontSize: 11,
    color: '#757575',
    marginTop: 2,
    fontWeight: '500',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1976D2',
  },
  metricLabel: {
    fontSize: 9,
    color: '#757575',
    fontWeight: '600',
    marginTop: 2,
  },
  metricDivider: {
    height: 30,
    width: 1,
  },
  controlsContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 12,
    elevation: 2,
  },
  searchbar: {
    backgroundColor: '#F8F9FA',
    elevation: 0,
    marginBottom: 12,
    height: 40,
  },
  searchInput: {
    fontSize: 14,
    minHeight: 0,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    backgroundColor: '#F8F9FA',
    height: 28,
  },
  filterChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#757575',
  },
  table: {
    flex: 1,
    backgroundColor: 'white',
  },
  headerContainer: {
    backgroundColor: '#1976D2',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  headerRow: {
    alignItems: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  compactCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    minHeight: 60,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameSection: {
    flex: 1,
    marginRight: 8,
  },
  compactName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 1,
  },
  compactTime: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  compactStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    minWidth: 70,
    justifyContent: 'center',
  },
  compactStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  detailItem: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  detailSeparator: {
    fontSize: 11,
    color: '#CCC',
    fontWeight: '400',
  },
  lateDetail: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D32F2F',
  },
  timeAlertDetail: {
    fontSize: 11,
    fontWeight: '700',
  },
  compactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  compactMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#757575',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    right: 16,
    bottom: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
