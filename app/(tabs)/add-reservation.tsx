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
  Switch
} from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { format } from 'date-fns';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { useRouter } from 'expo-router';
import { AutoCompleteInput } from '../../components/ui/AutoCompleteInput';
import { OverBookingAlert } from '../../components/ui/OverBookingAlert';

const schema = yup.object().shape({
  name: yup.string().required('Customer name is required').min(2, 'Name must be at least 2 characters'),
  date: yup.string().required('Date is required'),
  nb_people: yup.number().required('Number of people is required').min(1, 'Must have at least 1 person').max(50, 'Maximum 50 people allowed'),
  single_canoes: yup.number().min(0, 'Cannot be negative').integer('Must be a whole number'),
  double_canoes: yup.number().min(0, 'Cannot be negative').integer('Must be a whole number'),
  arrival_time: yup.string().required('Arrival time is required'),
  timeslot: yup.string().required('Time slot is required'),
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

  const { control, handleSubmit, formState: { errors }, watch, setValue, reset } = useForm<FormData>({
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

  // Auto-suggest canoes when people count changes
  useEffect(() => {
    if (autoSuggestEnabled && db) {
      const suggestion = db.suggestCanoeAllocation(watchedValues.nb_people);
      setValue('single_canoes', suggestion.single);
      setValue('double_canoes', suggestion.double);
    }
  }, [watchedValues.nb_people, autoSuggestEnabled, db, setValue]);

  // Check for overbooking
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
        console.error('Error checking overbooking:', error);
      }
    };

    const debounceTimer = setTimeout(checkOverbooking, 500);
    return () => clearTimeout(debounceTimer);
  }, [
    watchedValues.date,
    watchedValues.timeslot,
    watchedValues.single_canoes,
    watchedValues.double_canoes,
    db
  ]);

  const onSubmit = async (data: FormData) => {
    if (!db) return;

    if (data.single_canoes === 0 && data.double_canoes === 0) {
      Alert.alert('Error', 'Please select at least one canoe');
      return;
    }

    const totalCapacity = data.single_canoes * 1 + data.double_canoes * 2;
    if (totalCapacity < data.nb_people) {
      Alert.alert(
        'Capacity Error', 
        `Selected canoes can accommodate ${totalCapacity} people, but you have ${data.nb_people} people. Please adjust your selection.`
      );
      return;
    }

    // Check for overbooking one more time before submitting
    const overbookingCheck = await db.checkOverbooking(
      data.date,
      data.timeslot,
      data.single_canoes,
      data.double_canoes
    );

    if (overbookingCheck.isOverbooked) {
      Alert.alert(
        'Overbooking Warning',
        `${overbookingCheck.message}\n\nDo you want to proceed anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Proceed', 
            style: 'destructive',
            onPress: () => createReservation(data)
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
      
      Alert.alert('Success', 'Reservation created successfully!', [
        {
          text: 'Create Another',
          onPress: () => reset(),
        },
        {
          text: 'View Dashboard',
          onPress: () => router.push('/'),
        },
      ]);
    } catch (error) {
      console.error('Error creating reservation:', error);
      Alert.alert('Error', 'Failed to create reservation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const timeSlotOptions = [
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'full_day', label: 'Full Day' },
  ];

  const manualSuggestCanoes = () => {
    const suggestion = db!.suggestCanoeAllocation(watchedValues.nb_people);
    setValue('single_canoes', suggestion.single);
    setValue('double_canoes', suggestion.double);
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const totalCapacity = watchedValues.single_canoes * 1 + watchedValues.double_canoes * 2;
  const isCapacityValid = totalCapacity >= watchedValues.nb_people;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Title style={styles.headerTitle}>New Reservation</Title>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          Create a new canoe rental reservation
        </Text>
      </View>

      <OverBookingAlert
        isVisible={overbookingAlert.isVisible}
        message={overbookingAlert.message}
      />

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Customer Information
          </Text>

          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <AutoCompleteInput
                label="Customer Name *"
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
                placeholder="YYYY-MM-DD"
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
                label="Arrival Time *"
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
            Booking Details
          </Text>

          <Controller
            control={control}
            name="nb_people"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Number of People *"
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
              Time Slot *
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
              Canoe Selection
            </Text>
            <View style={styles.autoSuggestContainer}>
              <Text variant="labelMedium" style={styles.autoSuggestLabel}>
                Auto-suggest
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
              Suggest Optimal Allocation
            </Button>
          )}

          <Controller
            control={control}
            name="single_canoes"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Single Canoes (1 person each)"
                value={value.toString()}
                onChangeText={(text) => onChange(parseInt(text) || 0)}
                onBlur={onBlur}
                error={!!errors.single_canoes}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
                right={<TextInput.Icon icon="canoe" />}
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
                label="Double Canoes (2 people each)"
                value={value.toString()}
                onChangeText={(text) => onChange(parseInt(text) || 0)}
                onBlur={onBlur}
                error={!!errors.double_canoes}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
                right={<TextInput.Icon icon="canoe" />}
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
                { color: isCapacityValid ? theme.colors.success : theme.colors.error }
              ]}
            >
              Total capacity: {totalCapacity} people
              {!isCapacityValid && ` (Need ${watchedValues.nb_people - totalCapacity} more)`}
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
          Create Reservation
        </Button>
        
        <Button
          mode="outlined"
          onPress={() => reset()}
          disabled={loading}
          style={styles.resetButton}
        >
          Reset Form
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