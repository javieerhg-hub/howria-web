// Los dos gráficos de recharts que usa Inicio/Mis Paseos, separados en su
// propio chunk. HowriaAdmin.jsx se carga siempre (hasta para la pantalla
// de login), y recharts es pesada — no vale la pena bajarla antes de que
// alguien entre de verdad y llegue a ver un gráfico. Cargado con
// React.lazy() desde HowriaAdmin.jsx, mismo patrón que las 14 pestañas de
// HowriaAdminResto.jsx y la ruta guiada de RutaGuiada.jsx.
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { NAVY, fmtCLP } from "./HowriaAdmin.jsx";

export function AnilloHoy({ datosAnillo }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={datosAnillo} dataKey="value" innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
          {datosAnillo.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GraficoIngresosSemana({ data }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EDE4CE" />
        <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#8A7E5C" }} />
        <YAxis tick={{ fontSize: 11, fill: "#8A7E5C" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(v) => fmtCLP(v)} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #EDE4CE" }} />
        <Bar dataKey="total" fill={NAVY} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
