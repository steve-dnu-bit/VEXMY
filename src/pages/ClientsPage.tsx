import { Navigate } from "react-router-dom";

/** @deprecated Clients list lives under Admin → Client list. */
const ClientsPage = () => <Navigate to="/admin?tab=clients" replace />;

export default ClientsPage;
