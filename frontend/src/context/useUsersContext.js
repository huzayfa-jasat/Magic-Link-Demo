// Dependencies
import { useContext } from 'react';

// Context
import { UsersContext } from './usersContext';

// Hook
export const useUsersContext = () => useContext(UsersContext);