import { Box } from '@mui/material';
import CustomBarChart from './CustomBarChart';
import CustomPieChart from './CustomPieChart';
import CustomHeatMap from './CustomHeatMap';
import { ChartSetting } from '../../constants/queries_chart_info';
import CustomBoxPlot from './CustomBoxPlot';
import CustomScatterChart from './CustomScatterChart';
import { resolveChartColors } from '../../constants/brandColors';

interface ChartWrapperProps {
  dataset: any[];
  chartSetting: ChartSetting;
  question_id: string;
  normalized?: boolean;
  loading: boolean;
  defaultChartType?: 'bar' | 'pie' | 'heatmap' | 'boxplot' | 'scatter';
  availableCharts?: ('bar' | 'pie' | 'heatmap' | 'boxplot' | 'scatter')[];
  isSubChart?: boolean;
}

const ChartWrapper = ({
  dataset,
  chartSetting,
  question_id,
  normalized = true,
  loading = false,
  defaultChartType = 'bar',
  isSubChart = false,
}: ChartWrapperProps) => {
  const themedChartSetting: ChartSetting = {
    ...chartSetting,
    colors: resolveChartColors(chartSetting.colors) ?? chartSetting.colors,
  };

  return (
    <Box sx={{ width: '100%' }}>
      {defaultChartType === 'pie' ? (
        <CustomPieChart
          dataset={dataset}
          chartSetting={themedChartSetting}
          question_id={question_id}
        />
      ) : defaultChartType === 'heatmap' ? (
        <CustomHeatMap
          dataset={dataset}
          chartSetting={themedChartSetting}
          question_id={question_id}
        />
      ) : defaultChartType === 'boxplot' ? (
        <CustomBoxPlot
          dataset={dataset}
          chartSetting={themedChartSetting}
          question_id={question_id}
          loading={loading}
        />
      ) : defaultChartType === 'scatter' ? (
        <CustomScatterChart
          dataset={dataset}
          chartSetting={themedChartSetting}
          question_id={question_id}
          normalized={normalized}
          loading={loading}
        />
      ) : (
        <CustomBarChart
          dataset={dataset}
          chartSetting={themedChartSetting}
          question_id={question_id}
          normalized={normalized}
          loading={loading}
          isSubChart={isSubChart}
        />
      )}
    </Box>
  );
};

export default ChartWrapper;
