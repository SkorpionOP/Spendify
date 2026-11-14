/* eslint-disable react-refresh/only-export-components */
import {
  Bike,
  Cat,
  Coffee,
  Cookie,
  Dumbbell,
  Film,
  Gamepad2,
  Gift,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Home,
  Package,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingUp,
  Tv,
  Users,
  Utensils,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import { category as getCategory } from '../lib/categories';

export const CATEGORY_ICONS = {
  Food: UtensilsCrossed,
  Snacks: Cookie,
  Coffee: Coffee,
  Groceries: ShoppingCart,
  'Dining Out': Utensils,
  Transport: Bike,
  Shopping: ShoppingBag,
  Beauty: Sparkles,
  Phone: Smartphone,
  Bills: Zap,
  Rent: Home,
  Subscriptions: Tv,
  Health: HeartPulse,
  Fitness: Dumbbell,
  Entertainment: Film,
  Travel: Plane,
  Education: GraduationCap,
  Family: Users,
  Gifts: Gift,
  Charity: HandHeart,
  Pets: Cat,
  Investment: TrendingUp,
  Games: Gamepad2,
  Others: Package,
};

export function CategoryIcon({ name, size = 20, className = '', color = null, strokeWidth = 2.2 }) {
  const meta = getCategory(name);
  const IconComponent = CATEGORY_ICONS[name] || Package;
  const iconColor = color || meta?.color || 'currentColor';

  return (
    <IconComponent
      size={size}
      className={`cat-icon ${className}`}
      style={{ color: iconColor }}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  );
}
