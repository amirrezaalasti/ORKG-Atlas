import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import Rotate from '../../src/components/Rotate';

const meta: Meta<typeof Rotate> = {
  title: 'Utilities/Rotate',
  component: Rotate,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A Motion-powered square that rotates 360° on mount. Uses the theme primary color and respects `prefers-reduced-motion`.',
      },
    },
  },
  argTypes: {
    size: {
      description: 'Width and height of the square, in pixels',
      control: { type: 'number', min: 24, max: 240, step: 8 },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Rotate>;

export const Default: Story = {
  args: {
    size: 100,
  },
  render: (args) => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        p: 4,
      }}
    >
      <Rotate {...args} />
    </Box>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Default 100×100 square using `primary.main`. The rotation plays once on mount.',
      },
    },
  },
};

export const Compact: Story = {
  args: {
    size: 48,
  },
  render: Default.render,
  parameters: {
    docs: {
      description: {
        story: 'Smaller size for inline or toolbar-adjacent use.',
      },
    },
  },
};
