import React from 'react';

export const UsersContext = React.createContext({
  user: null,
  onChangeUser: () => {},
  changeUserEmail: () => {},
});