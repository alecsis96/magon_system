import { Tabs } from 'expo-router';
import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Reparto',
          tabBarIcon: ({ color }) => <MaterialIcons size={24} name="local-shipping" color={color} />,
        }}
      />
      <Tabs.Screen
        name="estado"
        options={{
          title: 'Estado',
          tabBarIcon: ({ color }) => <MaterialIcons size={24} name="monitor-heart" color={color} />,
        }}
      />
    </Tabs>
  );
}
