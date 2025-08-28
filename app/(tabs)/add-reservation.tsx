import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import {
  TextInput,
  Button,
  Card,
  Title,
  Text,
  SegmentedButtons,
  useTheme,
  HelperText,
  Switch,
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { useRouter } from 'expo-router';
import { AutoCompleteInput } from '../../components/ui/AutoCompleteInput';
import { OverBookingAlert } from '../../components/ui/OverBookingAlert';

const schema = yup.object().shape({
  name: yup
    .string()
    .required('Le nom du client est requis')
    .min(2, 'Le nom doit contenir au moins 2 caractères'),
  date: yup.string().required('La date est requise'),
  nb_people: yup
    .number()
    .required('Le nombre de personnes est requis')
    .min(1, 'Il doit y avoir au moins 1 personne')
    .max(50, 'Maximum 50 personnes autorisées'),
  single_canoes: yup
    .number()
    .min(0, 'Ne peut pas être négatif')
    .integer('Doit être un nombre entier'),
  double_canoes: yup
    .number()
    .min(0, 'Ne peut pas être négatif')
    .integer('Doit être un nombre entier'),
  arrival_time: yup.string().required("L'heure d'arrivée est requise"),
  timeslot: yup.string().required('Le créneau horaire est requis'),
});

type FormData = {
  name: string;
  date: string;
  nb_people: number;
  single_canoes: number;
  double_canoes: number;
  arrival_time: string;
  timeslot: 'morning' | 'afternoon' | 'full_day';
};

export default function AddReservation() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [autoSuggestEnabled, setAutoSuggestEnabled] = useState(true);
  const [overbookingAlert, setOverbookingAlert] = useState<{
    isVisible: boolean;
    message: string;
  }>({ isVisible: false, message: '' });

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      nb_people: 1,
      single_canoes: 0,
      double_canoes: 0,
      arrival_time: '09:00',
      timeslot: 'morning',
    },
  });

  const watchedValues = watch();

  // Suggestion automatique de canoës quand le nombre de personnes change
  useEffect(() => {
    if (autoSuggestEnabled && db) {
      const suggestion = db.suggestCanoeAllocation(watchedValues.nb_people);
      setValue('single_canoes', suggestion.single);
      setValue('double_canoes', suggestion.double);
    }
  }, [watchedValues.nb_people, autoSuggestEnabled, db, setValue]);

  // Vérification d'overbooking
  useEffect(() => {
    const checkOverbooking = async () => {
      if (!db || !watchedValues.date || !watchedValues.timeslot) return;

      try {
        const result = await db.checkOverbooking(
          watchedValues.date,
          watchedValues.timeslot,
          watchedValues.single_canoes,
          watchedValues.double_canoes
        );

        setOverbookingAlert({
          isVisible: result.isOverbooked,
          message: result.message || '',
        });
      } catch (error) {
        console.error("Erreur lors de la vérification d'overbooking:", error);
      }
    };

    const debounceTimer = setTimeout(checkOverbooking, 500);
    return () => clearTimeout(debounceTimer);
  }, [
    watchedValues.date,
    watchedValues.timeslot,
    watchedValues.single_canoes,
    watchedValues.double_canoes,
    db,
  ]);

  const onSubmit = async (data: FormData) => {
    if (!db) return;

    if (data.single_canoes === 0 && data.double_canoes === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins un canoë');
      return;
    }

    const totalCapacity = data.single_canoes * 1 + data.double_canoes * 2;
    if (totalCapacity < data.nb_people) {
      Alert.alert(
        'Erreur de capacité',
        `Les canoës sélectionnés peuvent accueillir ${totalCapacity} personnes, mais vous avez ${data.nb_people} personnes. Veuillez ajuster votre sélection.`
      );
      return;
    }

    // Vérifier l'overbooking une dernière fois avant de soumettre
    const overbookingCheck = await db.checkOverbooking(
      data.date,
      data.timeslot,
      data.single_canoes,
      data.double_canoes
    );

    if (overbookingCheck.isOverbooked) {
      Alert.alert(
        'Avertissement de surbooking',
        `${overbookingCheck.message}\n\nVoulez-vous continuer quand même ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Continuer',
            style: 'destructive',
            onPress: () => createReservation(data),
          },
        ]
      );
      return;
    }

    await createReservation(data);
  };

  const createReservation = async (data: FormData) => {
    setLoading(true);
    try {
      await db!.createReservation({
        ...data,
        status: 'pending',
      });

      Alert.alert('Succès', 'Réservation créée avec succès !', [
        {
          text: 'Créer une autre',
          onPress: () => reset(),
        },
        {
          text: 'Voir le tableau de bord',
          onPress: () => router.push('/'),
        },
      ]);
    } catch (error) {
      console.error('Erreur lors de la création de la réservation:', error);
      Alert.alert(
        'Erreur',
        'Échec de la création de la réservation. Veuillez réessayer.'
      );
    } finally {
      setLoading(false);
    }
  };

  const timeSlotOptions = [
    { value: 'morning', label: 'Matin' },
    { value: 'afternoon', label: 'Après-midi' },
    { value: 'full_day', label: 'Journée complète' },
  ];

  const manualSuggestCanoes = () => {
    const suggestion = db!.suggestCanoeAllocation(watchedValues.nb_people);
    setValue('single_canoes', suggestion.single);
    setValue('double_canoes', suggestion.double);
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  const totalCapacity =
    watchedValues.single_canoes * 1 + watchedValues.double_canoes * 2;
  const isCapacityValid = totalCapacity >= watchedValues.nb_people;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Title style={styles.headerTitle}>Nouvelle Réservation</Title>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          Créer une nouvelle réservation de location de canoës
        </Text>
      </View>

      <OverBookingAlert
        isVisible={overbookingAlert.isVisible}
        message={overbookingAlert.message}
      />

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Informations Client
          </Text>

          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <AutoCompleteInput
                label="Nom du client *"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={!!errors.name}
                style={styles.input}
                mode="outlined"
              />
            )}
          />
          <HelperText type="error" visible={!!errors.name}>
            {errors.name?.message}
          </HelperText>

          <Controller
            control={control}
            name="date"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Date *"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={!!errors.date}
                style={styles.input}
                mode="outlined"
                placeholder="AAAA-MM-JJ"
                right={<TextInput.Icon icon="calendar" />}
              />
            )}
          />
          <HelperText type="error" visible={!!errors.date}>
            {errors.date?.message}
          </HelperText>

          <Controller
            control={control}
            name="arrival_time"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Heure d'arrivée *"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={!!errors.arrival_time}
                style={styles.input}
                mode="outlined"
                placeholder="HH:MM"
                right={<TextInput.Icon icon="clock-outline" />}
              />
            )}
          />
          <HelperText type="error" visible={!!errors.arrival_time}>
            {errors.arrival_time?.message}
          </HelperText>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Détails de la Réservation
          </Text>

          <Controller
            control={control}
            name="nb_people"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Nombre de personnes *"
                value={value.toString()}
                onChangeText={(text) => onChange(parseInt(text) || 0)}
                onBlur={onBlur}
                error={!!errors.nb_people}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
                right={<TextInput.Icon icon="account-group" />}
              />
            )}
          />
          <HelperText type="error" visible={!!errors.nb_people}>
            {errors.nb_people?.message}
          </HelperText>

          <View style={styles.timeslotContainer}>
            <Text variant="bodyMedium" style={styles.timeslotLabel}>
              Créneau horaire *
            </Text>
            <Controller
              control={control}
              name="timeslot"
              render={({ field: { onChange, value } }) => (
                <SegmentedButtons
                  value={value}
                  onValueChange={onChange}
                  buttons={timeSlotOptions}
                  style={styles.segmentedButtons}
                />
              )}
            />
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.canoesSectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Sélection des Canoës
            </Text>
            <View style={styles.autoSuggestContainer}>
              <Text variant="labelMedium" style={styles.autoSuggestLabel}>
                Suggestion auto
              </Text>
              <Switch
                value={autoSuggestEnabled}
                onValueChange={setAutoSuggestEnabled}
              />
            </View>
          </View>

          {!autoSuggestEnabled && (
            <Button
              mode="outlined"
              onPress={manualSuggestCanoes}
              style={styles.suggestButton}
              icon="lightbulb-outline"
            >
              Suggérer l'allocation optimale
            </Button>
          )}

          <Controller
            control={control}
            name="single_canoes"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Canoës simples (1 personne chacun)"
                value={value.toString()}
                onChangeText={(text) => onChange(parseInt(text) || 0)}
                onBlur={onBlur}
                error={!!errors.single_canoes}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
                right={<TextInput.Icon icon="kayaking" />}
              />
            )}
          />
          <HelperText type="error" visible={!!errors.single_canoes}>
            {errors.single_canoes?.message}
          </HelperText>

          <Controller
            control={control}
            name="double_canoes"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Canoës doubles (2 personnes chacun)"
                value={value.toString()}
                onChangeText={(text) => onChange(parseInt(text) || 0)}
                onBlur={onBlur}
                error={!!errors.double_canoes}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
                right={<TextInput.Icon icon="kayaking" />}
              />
            )}
          />
          <HelperText type="error" visible={!!errors.double_canoes}>
            {errors.double_canoes?.message}
          </HelperText>

          <View style={styles.capacityInfo}>
            <Text
              variant="bodySmall"
              style={[
                styles.capacityText,
                {
                  color: isCapacityValid
                    ? theme.colors.primary
                    : theme.colors.error,
                },
              ]}
            >
              Capacité totale : {totalCapacity} personnes
              {!isCapacityValid &&
                ` (Il manque ${
                  watchedValues.nb_people - totalCapacity
                } places)`}
            </Text>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={loading}
          disabled={loading || !isCapacityValid}
          style={styles.submitButton}
        >
          Créer la Réservation
        </Button>

        <Button
          mode="outlined"
          onPress={() => reset()}
          disabled={loading}
          style={styles.resetButton}
        >
          Réinitialiser le formulaire
        </Button>
      </View>
    </ScrollView>
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
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
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
  card: {
    marginBottom: 16,
    backgroundColor: 'white',
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 16,
    color: '#1976D2',
  },
  input: {
    marginBottom: 4,
  },
  timeslotContainer: {
    marginTop: 8,
  },
  timeslotLabel: {
    marginBottom: 8,
    fontWeight: '500',
  },
  segmentedButtons: {
    marginBottom: 8,
  },
  canoesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  autoSuggestContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoSuggestLabel: {
    color: '#666',
  },
  suggestButton: {
    borderColor: '#1976D2',
    marginBottom: 16,
  },
  capacityInfo: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  capacityText: {
    fontWeight: '500',
    textAlign: 'center',
  },
  buttonContainer: {
    marginTop: 24,
    gap: 12,
  },
  submitButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 4,
  },
  resetButton: {
    borderColor: '#666',
  },
});
