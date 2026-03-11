import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api, { type UserPublic } from '../../services/api';

interface AuthState {
  user: UserPublic | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: api.getStoredUser(),
  loading: false,
  error: null,
};

export const loginUser = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const data = await api.login(email, password);
      return data.user;
    } catch (err) {
      return rejectWithValue((err as Error).message);
    }
  }
);

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    return await api.getMe();
  } catch (err) {
    return rejectWithValue((err as Error).message);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      api.logout();
      state.user = null;
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
      });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;
