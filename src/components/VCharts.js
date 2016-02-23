import VisualizationComponent from './../components';
import vcharts from 'vcharts';

export default class LineChart extends VisualizationComponent {
  constructor (el, data) {
    super(el);

    let values = data.map((x) => x[1]);

    let minY = Math.min(...values);
    if (minY === -Infinity) {
      minY = 0;
    }
    this.minY = minY;

    let maxY = Math.max(...values);
    if (maxY === Infinity) {
      maxY = 0;
    }

    maxY += (maxY - minY) * 0.20;
    this.maxY = maxY;

    this.data(data);
  }

  data (data) {
    this.chart = vcharts.chart('xy', {
      el: this.el,
      series: [
        {
          name: 'series1',
          values: data,
          x: '0',
          y: '1',
          color: 'darkslategray',
          line: true,
          point: true
        }
      ],
      xAxis: {
        title: 'X',
        type: 'time'
      },
      yAxis: {
        title: 'Y',
        zoom: false,
        pan: false,
        domain: [this.minY, this.maxY]
      },
      padding: {
        top: 100,
        bottom: 100,
        left: 100,
        right: 100
      }
    });
  }

  render () {
    this.chart.update();
    this.emit('render');
  }
}

export default LineChart;