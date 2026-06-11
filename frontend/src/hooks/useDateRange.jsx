import React, { createContext, useContext, useState } from 'react';

const DateRangeContext = createContext(null);

export const DateRangeProvider = ({ children }) => {
  // Default to current month
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(formatDate(startOfMonth));
  const [endDate, setEndDate] = useState(formatDate(endOfMonth));
  const [isFiltered, setIsFiltered] = useState(false);

  const setDateRange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
    setIsFiltered(true);
  };

  const resetDateRange = () => {
    setStartDate(formatDate(startOfMonth));
    setEndDate(formatDate(endOfMonth));
    setIsFiltered(false);
  };

  return (
    <DateRangeContext.Provider value={{ startDate, endDate, setDateRange, resetDateRange, isFiltered }}>
      {children}
    </DateRangeContext.Provider>
  );
};

export const useDateRange = () => {
  const context = useContext(DateRangeContext);
  if (!context) {
    throw new Error('useDateRange must be used within a DateRangeProvider');
  }
  return context;
};
