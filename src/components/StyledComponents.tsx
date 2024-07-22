import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import pink from "@mui/material/colors/pink";
import { styled } from "@mui/system";
import Box from "@mui/material/Box";

export const StyledSelect = styled(FormControl)(({ theme }) => ({
  width: "100%",
  marginBottom: theme.spacing(2),
}));

export const StyledDivider = styled(Divider)(({ theme }) => ({
  marginBottom: theme.spacing(2),
}));

export const ButtonContainer = styled(Box)(({ theme }) => ({
  position: "relative",
  marginBottom: theme.spacing(1),
}));

export const ButtonProgress = styled(CircularProgress)(({ theme }) => ({
  color: pink[500],
  position: "absolute",
  top: "50%",
  left: "50%",
  marginTop: -12,
  marginLeft: -12,
}));

export const LastButton = styled(Button)(({ theme }) => ({
  marginBottom: theme.spacing(2),
}));

export const CloseButton = styled(IconButton)(({ theme }) => ({
  marginTop: -theme.spacing(1.5),
  marginLeft: -theme.spacing(1.5),
  width: theme.spacing(6),
}));

export const SettingsHeader = styled(Box)({
  display: "flex",
  justifyContent: "flex-start",
});

export const SettingsButton = styled(Button)(({ theme }) => ({
  borderTopLeftRadius: theme.spacing(2),
  borderTopRightRadius: theme.spacing(2),
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  padding: `${theme.spacing(1.5)}px ${theme.spacing(3)}px`,
}));

export const SettingsDrawer = styled(Drawer)({
  backgroundColor: "transparent",
});

export const SettingsDrawerInner = styled(Paper)(({ theme }) => ({
  borderTopLeftRadius: theme.spacing(2),
  borderTopRightRadius: theme.spacing(2),
  maxWidth: "300px",
  padding: theme.spacing(2),
  boxSizing: "border-box",
  margin: `${theme.spacing(2)}px auto 0 auto`,
}));

export const SliderLabelContainer = styled("div")({
  display: "flex",
  justifyContent: "space-between",
});
