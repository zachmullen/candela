import Underscore from 'underscore';
import backbone from 'backbone';
import Widget from '../Widget';
import myTemplate from './template.html';
import candela from '../../../../../src/candela';
import shareIcon from '../../../images/share.svg';
import ExportView from '../../overlays/ExportView';
import './style.css';

let STATUS = {
  OK: 0,
  LOADING: 1,
  NO_VIS_SELECTED: 2,
  NOT_ENOUGH_MAPPINGS: 3,
  FAILED_RENDER: 4
};

let VisualizationView = Widget.extend({
  initialize: function () {
    Widget.prototype.initialize.apply(this, arguments);

    this.icons.splice(0, 0, {
      src: Widget.swapIcon,
      title: 'Click to select a different visualization',
      onclick: () => {
        window.mainPage.overlay.render('VisualizationLibrary');
      }
    });

    this.status = STATUS.LOADING;
    this.icons.push({
      src: () => {
        if (this.status === STATUS.LOADING) {
          return Widget.spinnerIcon;
        } else if (this.status === STATUS.OK) {
          return Widget.okayIcon;
        } else {
          return Widget.warningIcon;
        }
      },
      className: () => {
        if (this.status === STATUS.LOADING) {
          return 'loading';
        } else if (this.status === STATUS.OK) {
          return 'okay';
        } else {
          return 'warning';
        }
      },
      title: () => {
        if (this.status === STATUS.LOADING) {
          return 'The visualization hasn\'t finished loading yet';
        } else if (this.status === STATUS.OK) {
          return 'The visualization appears to be working';
        } else {
          return 'Something isn\'t quite right; click for details';
        }
      },
      onclick: () => {
        this.renderHelpScreen();
      }
    });

    this.icons.splice(0, 0, {
      src: shareIcon,
      title: 'Export',
      onclick: () => {
        if (this.vis) {
          window.mainPage.overlay.render(new ExportView({
            model: new backbone.Model({vis: this.vis})
          }));
        }
      },
      className: () => {
        if (this.vis) {
          return null;
        } else {
          return 'disabled';
        }
      }
    });

    this.listenTo(window.mainPage, 'rl:changeProject',
      this.handleNewProject);
    this.handleNewProject();
  },
  handleNewProject: function () {
    this.$el.html('');
    this.status = STATUS.LOADING;
    this.vis = null;

    if (window.mainPage.project) {
      this.stopListening(window.mainPage.project, 'rl:changeVisualizations');
      this.listenTo(window.mainPage.project, 'rl:changeVisualizations',
        this.render);

      this.stopListening(window.mainPage.project, 'rl:changeMatchings');
      this.listenTo(window.mainPage.project, 'rl:changeMatchings',
        this.render);
    }
  },
  renderInfoScreen: function () {
    window.mainPage.helpLayer.showTips(this.getDefaultTips());
  },
  renderHelpScreen: function () {
    if (this.status === STATUS.LOADING) {
      window.mainPage.overlay.renderLoadingScreen('Still attempting to render the visualization...');
    } else if (this.status === STATUS.OK) {
      window.mainPage.overlay.renderSuccessScreen('The visualization appears to be functioning correctly.');
    } else if (this.status === STATUS.NO_VIS_SELECTED) {
      window.mainPage.overlay.renderUserErrorScreen('You have not <a onclick="window.mainPage.overlay.render(\'VisualizationLibrary\')">chosen a visualization</a> yet.');
    } else if (this.status === STATUS.NOT_ENOUGH_MAPPINGS) {
      window.mainPage.overlay.renderUserErrorScreen('This visualization needs more data matchings. Make sure there are no orange circles in the Matching panel.');
    } else if (this.status === STATUS.FAILED_RENDER) {
      window.mainPage.overlay.renderReallyBadErrorScreen('There was a failure in attempting to render the visualization. There may be some hints in the developer console.');
    } else if (this.status === STATUS.LOADING) {
      window.mainPage.overlay.renderLoadingScreen('The visualization is still loading.');
    }
  },
  render: Underscore.debounce(function () {
    let widgetIsShowing = Widget.prototype.render.apply(this, arguments);
    if (!widgetIsShowing) {
      this.vis = undefined;
    }

    // Get the visualization in the project (if there is one)
    let spec = window.mainPage.project ? window.mainPage.project.getMeta('visualizations') : null;
    if (spec && spec.length > 0) {
      // Use the first spec (TODO: support multiple visualizations)
      spec = spec[0];

      // Get the options for the vis
      let options = window.mainPage.project.getVisOptions(0);

      // Start with an initial empty dataset (gets populated
      // asynchronously)
      options.data = [];

      if (widgetIsShowing) {
        // How is this render pass different from the last?
        if (!this.vis || this.vis.spec.name !== spec.name) {
          // We've changed visualizations; nuke the DOM element
          // and create a new candela component
          this.$el.html(myTemplate);

          this.vis = {
            spec: spec,
            options: options,
            component: new candela.components[spec.name](
              '#' + this.spec.hashName + 'Container .visualization', options)
          };
        } else {
          // The visualization hasn't changed, but the options may have.
          Object.keys(this.vis.options).forEach(key => {
            if (!options.hasOwnProperty(key)) {
              // This option is no longer specified;
              // remove it so that it's removed from the visualization
              delete options[key];
            }
          });

          this.vis.options = options;
        }
      }

      // Okay, now ask the project if it has any new data for
      // us (changing the matchings, editing the data, or grabbing
      // a new dataset will invalidate the parsed cache).
      this.status = STATUS.LOADING;
      this.statusText.text = 'Loading...';
      this.$el.find('#visualization, #noVisualizationState').hide();
      this.renderIndicators();
      window.mainPage.project.shapeDataForVis().then(data => {
        widgetIsShowing = this.isTargeted();
        if (widgetIsShowing) {
          this.vis.options.data = data;

          // TODO: how do we update the data for a component in general?
          let successfullyUpdated = false;
          if (this.vis.component.chart &&
            this.vis.component.chart.update) {
            try {
              this.vis.component.chart.update(this.vis.options);
              successfullyUpdated = true;
            } catch (errorObj) {
              // TODO: warn the user that something is up?
              // window.mainPage.trigger('rlab:error', errorObj);
              console.warn('Could not update the visualization in place:',
                errorObj);
            }
          }
          if (!successfullyUpdated) {
            // Nuke the vis and start fresh
            this.$el.html(myTemplate);
            try {
              this.vis.component = new candela.components[this.vis.spec.name](
                '#' + this.spec.hashName + 'Container .visualization', options);
            } catch (errorObj) {
              // Problem rendering the vis...
              this.$el.html(myTemplate);
              this.status = STATUS.FAILED_RENDER;
              this.statusText.text = spec.name;
              window.mainPage.trigger('rlab:error', errorObj);
              return;
            }
          }
          this.vis.component.render();
          this.$el.find('#noVisualizationState').hide();
          this.$el.find('#visualization').show();
        }
        // Okay, finally change the status if there aren't enough mappings
        // (for now, the empty state is the partially-rendered visualization...
        // should probably add something in its place in the future)
        if (!window.mainPage.widgetPanels.widgets.MatchingView.widget.isSatisfied()) {
          this.status = STATUS.NOT_ENOUGH_MAPPINGS;
        } else {
          this.status = STATUS.OK;
        }
        this.statusText.text = spec.name;
        this.renderIndicators();
      });
    } else {
      this.$el.html(myTemplate);
      // Add listener to empty state image
      this.$el.find('#noVisualizationState').on('click', () => {
        window.mainPage.overlay.render('VisualizationLibrary');
      });
      this.vis = null;
      this.status = STATUS.NO_VIS_SELECTED;
      this.statusText.text = 'None selected';
      this.renderIndicators();
    }
  }, 500)
});

export default VisualizationView;
