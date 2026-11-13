import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

interface ToastProps {
  visible: boolean;
  message: string;
  onHide: () => void;
  duration?: number;
  type?: 'success' | 'info' | 'warning';
}

// Faixa compacta no topo, sem Modal: o Modal nativo cobria a tela inteira, escurecia o fundo
// e engolia os toques durante toda a duração, o que atrapalhava a captura de fotos em sequência.
// Aqui só a própria faixa recebe toque; o resto da tela continua utilizável.
const ACCENT: Record<NonNullable<ToastProps['type']>, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: 'checkmark-circle', color: '#34D399' },
  warning: { icon: 'alert-circle', color: '#FBBF24' },
  info: { icon: 'information-circle', color: '#60A5FA' },
};

export const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  onHide,
  duration = 2000,
  type = 'success',
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(handleClose, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, message]);

  const handleClose = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => onHide());
  };

  if (!visible) return null;

  const accent = ACCENT[type];

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
        <Ionicons name={accent.icon} size={18} color={accent.color} />
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
        <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={16} color={theme.colors.textSubtle} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 480,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.text,
  },
  message: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textOnPrimary,
  },
});

// Hook personalizado para facilitar o uso
export const useToast = () => {
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'info' | 'warning';
  }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = (message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  return {
    showToast,
    toast: (
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    ),
  };
};
