import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

import { Line } from 'react-chartjs-2';
import { useNoiseStore } from '../../stores/useNoiseStore';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

export default function NoiseChart() {
  const { history } = useNoiseStore();

  const data = {
    labels: history.map((_, index) => `${index + 1}`),
    datasets: [
      {
        label: '소음(dB)',
        data: history,
      },
    ],
  };

  const options = {
    scales: {
      y: {
        min: 20,
        max: 100,
      },
    },
  };

  return <Line data={data} options={options} />;
}