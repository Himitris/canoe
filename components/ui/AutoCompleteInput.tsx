import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { TextInput, Card, Text, useTheme } from 'react-native-paper';
import { useDatabase } from '../database/DatabaseProvider';

interface AutoCompleteInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  error?: boolean;
  style?: any;
  mode?: 'flat' | 'outlined';
}

export function AutoCompleteInput({
  label,
  value,
  onChangeText,
  onBlur,
  error,
  style,
  mode = 'outlined',
}: AutoCompleteInputProps) {
  const { db } = useDatabase();
  const theme = useTheme();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const loadSuggestions = async () => {
      if (!db || value.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      try {
        const results = await db.getClientNameSuggestions(value, 5);
        setSuggestions(results.filter(name => name !== value));
        setShowSuggestions(results.length > 0 && results.some(name => name !== value));
      } catch (error) {
        console.error('Error loading suggestions:', error);
      }
    };

    const debounceTimer = setTimeout(loadSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [value, db]);

  const handleSuggestionPress = (suggestion: string) => {
    onChangeText(suggestion);
    setShowSuggestions(false);
  };

  const handleTextChange = (text: string) => {
    onChangeText(text);
    if (text.length < 2) {
      setShowSuggestions(false);
    }
  };

  const handleBlur = () => {
    // Delay hiding suggestions to allow for selection
    setTimeout(() => setShowSuggestions(false), 150);
    onBlur?.();
  };

  return (
    <View style={style}>
      <TextInput
        label={label}
        value={value}
        onChangeText={handleTextChange}
        onBlur={handleBlur}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
        error={error}
        mode={mode}
        right={<TextInput.Icon icon="account" />}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <Card style={styles.suggestionsCard} mode="outlined">
          <FlatList
            data={suggestions}
            keyExtractor={(item, index) => `${item}-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSuggestionPress(item)}
              >
                <Text variant="bodyMedium">{item}</Text>
              </TouchableOpacity>
            )}
            style={styles.suggestionsList}
            keyboardShouldPersistTaps="handled"
          />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestionsCard: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'white',
    maxHeight: 150,
  },
  suggestionsList: {
    maxHeight: 150,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
});